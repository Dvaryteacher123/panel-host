/**
 * DVARY HOSTING
 * FILE: models/HostingPlan.js
 * HostingPlan model - hosting plans zinaongezwa na ADMIN pekee
 */

'use strict';

const mongoose = require('mongoose');

const hostingPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Jina la plan linahitajika'],
      trim: true,
      minlength: [2, 'Jina liwe angalau herufi 2'],
      maxlength: [80, 'Jina lisizidi herufi 80'],
    },

    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    description: {
      type: String,
      required: [true, 'Maelezo yanahitajika'],
      trim: true,
      maxlength: [2000, 'Maelezo yasizidi herufi 2000'],
    },

    shortDescription: {
      type: String,
      trim: true,
      maxlength: [200, 'Maelezo mafupi yasizidi herufi 200'],
      default: null,
    },

    image: {
      type: String,
      trim: true,
      default: null,
    },

    // ============================
    // RESOURCES
    // ============================
    ram: {
      type: Number,
      required: [true, 'RAM inahitajika'],
      min: [0, 'RAM haiwezi kuwa chini ya 0'],
    },

    cpu: {
      type: Number,
      required: [true, 'CPU inahitajika'],
      min: [0, 'CPU haiwezi kuwa chini ya 0'],
    },

    disk: {
      type: Number,
      required: [true, 'Disk inahitajika'],
      min: [0, 'Disk haiwezi kuwa chini ya 0'],
    },

    // ============================
    // PRICE
    // ============================
    price: {
      type: Number,
      required: [true, 'Bei inahitajika'],
      min: [0, 'Bei haiwezi kuwa chini ya 0'],
    },

    // ============================
    // PTERODACTYL CONFIG (zote zinatoka kwa ADMIN)
    // ============================
    nodeId: {
      type: Number,
      default: null,
    },

    nestId: {
      type: Number,
      default: null,
    },

    eggId: {
      type: Number,
      default: null,
    },

    allocationId: {
      type: Number,
      default: null,
    },

    dockerImage: {
      type: String,
      trim: true,
      default: null,
    },

    startupCommand: {
      type: String,
      trim: true,
      default: null,
    },

    environmentVariables: {
      type: Map,
      of: String,
      default: {},
    },

    // ============================
    // STATUS
    // ============================
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },

    featured: {
      type: Boolean,
      default: false,
    },

    stock: {
      type: Number,
      default: null,
      min: 0,
    },

    totalPurchases: {
      type: Number,
      default: 0,
      min: 0,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ============================
// INDEXES
// ============================
hostingPlanSchema.index({ status: 1, createdAt: -1 });
hostingPlanSchema.index({ featured: -1, createdAt: -1 });
hostingPlanSchema.index({ price: 1 });

// ============================
// PRE-VALIDATE: GENERATE SLUG
// ============================
hostingPlanSchema.pre('validate', function (next) {
  if (this.name && (!this.slug || this.isModified('name'))) {
    this.slug =
      this.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
  }
  next();
});

// ============================
// VIRTUALS
// ============================
hostingPlanSchema.virtual('inStock').get(function () {
  if (this.stock === null) return true;
  return this.stock > 0;
});

// ============================
// METHODS
// ============================
hostingPlanSchema.methods.incrementPurchases = function () {
  this.totalPurchases += 1;
  if (this.stock !== null && this.stock > 0) {
    this.stock -= 1;
  }
  return this.save();
};

module.exports = mongoose.model('HostingPlan', hostingPlanSchema);
