/**
 * DVARY HOSTING
 * File: models/Bot.js
 * Bot model - bots zinaongezwa na ADMIN pekee
 */

'use strict';

const mongoose = require('mongoose');

const botSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Jina la bot linahitajika'],
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
      required: [true, 'Category inahitajika'],
      trim: true,
      lowercase: true,
    },

    tags: {
      type: [String],
      default: [],
    },

    // ============================
    // GITHUB INFO
    // ============================
    githubUrl: {
      type: String,
      required: [true, 'GitHub URL inahitajika'],
      trim: true,
      validate: {
        validator: function (v) {
          return /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/i.test(v);
        },
        message: 'GitHub URL si sahihi (mfano: https://github.com/user/repo)',
      },
    },

    githubBranch: {
      type: String,
      trim: true,
      default: 'main',
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
    // PTERODACTYL CONFIG (zote zinatoka kwa ADMIN)
    // ============================
    nestId: {
      type: Number,
      default: null,
    },

    eggId: {
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

    totalDeployments: {
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
botSchema.index({ category: 1, status: 1 });
botSchema.index({ name: 'text', description: 'text', tags: 'text' });
botSchema.index({ featured: -1, createdAt: -1 });

// ============================
// PRE-VALIDATE: GENERATE SLUG
// ============================
botSchema.pre('validate', function (next) {
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
// METHODS
// ============================
botSchema.methods.incrementDeployments = function () {
  this.totalDeployments += 1;
  return this.save();
};

module.exports = mongoose.model('Bot', botSchema);
