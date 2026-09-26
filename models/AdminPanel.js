/**
 * DVARY HOSTING
 * FILE: models/AdminPanel.js
 * AdminPanel model - admin panel products zinaongezwa na ADMIN pekee
 */

'use strict';

const mongoose = require('mongoose');

const adminPanelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Jina la panel linahitajika'],
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

    category: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },

    tags: {
      type: [String],
      default: [],
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
    // DELIVERY INFO
    // ============================
    downloadUrl: {
      type: String,
      trim: true,
      default: null,
    },

    deploymentInfo: {
      type: String,
      trim: true,
      default: null,
      maxlength: [2000, 'Deployment info isizidi herufi 2000'],
    },

    panelPassword: {
      type: String,
      trim: true,
      default: null,
      maxlength: [200, 'Password isizidi herufi 200'],
    },

    panelUsername: {
      type: String,
      trim: true,
      default: null,
      maxlength: [100, 'Username isizidi herufi 100'],
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
adminPanelSchema.index({ status: 1, createdAt: -1 });
adminPanelSchema.index({ featured: -1, createdAt: -1 });
adminPanelSchema.index({ price: 1 });
adminPanelSchema.index({ category: 1, status: 1 });

// ============================
// PRE-VALIDATE: GENERATE SLUG
// ============================
adminPanelSchema.pre('validate', function (next) {
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
adminPanelSchema.virtual('inStock').get(function () {
  if (this.stock === null) return true;
  return this.stock > 0;
});

// ============================
// METHODS
// ============================
adminPanelSchema.methods.incrementPurchases = function () {
  this.totalPurchases += 1;
  if (this.stock !== null && this.stock > 0) {
    this.stock -= 1;
  }
  return this.save();
};

module.exports = mongoose.model('AdminPanel', adminPanelSchema);
