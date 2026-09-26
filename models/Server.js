/**
 * DVARY HOSTING
 * FILE: models/Server.js
 * Server model - server zilizotengwa kupitia Pterodactyl (kutoka plan au bot)
 */

'use strict';

const mongoose = require('mongoose');

const serverSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User inahitajika'],
      index: true,
    },

    // ============================
    // CHANZO CHA SERVER
    // ============================
    source: {
      type: String,
      enum: ['hosting-plan', 'bot', 'admin-panel'],
      required: true,
    },

    hostingPlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HostingPlan',
      default: null,
    },

    bot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bot',
      default: null,
    },

    adminPanel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminPanel',
      default: null,
    },

    // ============================
    // SNAPSHOT
    // ============================
    name: {
      type: String,
      required: [true, 'Jina la server linahitajika'],
      trim: true,
    },

    description: {
      type: String,
      default: null,
      trim: true,
    },

    // ============================
    // RESOURCES
    // ============================
    ram: {
      type: Number,
      required: true,
      min: 0,
    },

    cpu: {
      type: Number,
      required: true,
      min: 0,
    },

    disk: {
      type: Number,
      required: true,
      min: 0,
    },

    // ============================
    // PTERODACTYL
    // ============================
    pterodactylServerId: {
      type: Number,
      default: null,
      index: true,
    },

    pterodactylServerIdentifier: {
      type: String,
      default: null,
      trim: true,
    },

    pterodactylServerUuid: {
      type: String,
      default: null,
      trim: true,
    },

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
      default: null,
      trim: true,
    },

    startupCommand: {
      type: String,
      default: null,
      trim: true,
    },

    environmentVariables: {
      type: Map,
      of: String,
      default: {},
    },

    // ============================
    // MALIPO
    // ============================
    coinsSpent: {
      type: Number,
      required: true,
      min: 0,
    },

    // ============================
    // STATUS
    // ============================
    status: {
      type: String,
      enum: ['creating', 'active', 'suspended', 'failed', 'deleted'],
      default: 'creating',
      index: true,
    },

    suspendedAt: {
      type: Date,
      default: null,
    },

    suspendReason: {
      type: String,
      default: null,
      trim: true,
    },

    errorMessage: {
      type: String,
      default: null,
      trim: true,
    },

    // ============================
    // RENEWAL (kwa baadaye)
    // ============================
    renewalDate: {
      type: Date,
      default: null,
    },

    autoRenew: {
      type: Boolean,
      default: false,
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
serverSchema.index({ user: 1, createdAt: -1 });
serverSchema.index({ status: 1, createdAt: -1 });
serverSchema.index({ pterodactylServerId: 1 }, { sparse: true });

// ============================
// VIRTUALS
// ============================
serverSchema.virtual('isActive').get(function () {
  return this.status === 'active';
});

serverSchema.virtual('isSuspended').get(function () {
  return this.status === 'suspended';
});

// ============================
// METHODS
// ============================
serverSchema.methods.markActive = function (data = {}) {
  this.status = 'active';
  this.errorMessage = null;
  if (data.pterodactylServerId) this.pterodactylServerId = data.pterodactylServerId;
  if (data.pterodactylServerIdentifier) this.pterodactylServerIdentifier = data.pterodactylServerIdentifier;
  if (data.pterodactylServerUuid) this.pterodactylServerUuid = data.pterodactylServerUuid;
  return this;
};

serverSchema.methods.markFailed = function (errorMessage) {
  this.status = 'failed';
  this.errorMessage = errorMessage || 'Server creation imefail';
  return this;
};

serverSchema.methods.markSuspended = function (reason = null) {
  this.status = 'suspended';
  this.suspendedAt = new Date();
  this.suspendReason = reason;
  return this;
};

serverSchema.methods.markUnsuspended = function () {
  this.status = 'active';
  this.suspendedAt = null;
  this.suspendReason = null;
  return this;
};

module.exports = mongoose.model('Server', serverSchema);
