/**
 * DVARY HOSTING
 * FILE: models/Deployment.js
 * Deployment model - kumbukumbu ya kila deployment ya bot
 */

'use strict';

const mongoose = require('mongoose');

const deploymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User inahitajika'],
      index: true,
    },

    bot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bot',
      required: [true, 'Bot inahitajika'],
      index: true,
    },

    // ============================
    // SNAPSHOT YA BOT WAKATI WA DEPLOY
    // ============================
    botName: {
      type: String,
      required: true,
      trim: true,
    },

    botImage: {
      type: String,
      default: null,
    },

    githubUrl: {
      type: String,
      required: true,
      trim: true,
    },

    githubBranch: {
      type: String,
      default: 'main',
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
    // MALIPO
    // ============================
    coinsSpent: {
      type: Number,
      required: true,
      min: 0,
    },

    // ============================
    // PTERODACTYL RESULT
    // ============================
    pterodactylServerId: {
      type: Number,
      default: null,
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

    // ============================
    // STATUS
    // ============================
    status: {
      type: String,
      enum: ['pending', 'processing', 'success', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },

    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    errorMessage: {
      type: String,
      default: null,
      trim: true,
    },

    logs: {
      type: [
        {
          message: { type: String, trim: true },
          timestamp: { type: Date, default: Date.now },
          level: {
            type: String,
            enum: ['info', 'warn', 'error', 'success'],
            default: 'info',
          },
        },
      ],
      default: [],
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ============================
// INDEXES
// ============================
deploymentSchema.index({ user: 1, createdAt: -1 });
deploymentSchema.index({ status: 1, createdAt: -1 });

// ============================
// VIRTUALS
// ============================
deploymentSchema.virtual('isSuccess').get(function () {
  return this.status === 'success';
});

deploymentSchema.virtual('isFailed').get(function () {
  return this.status === 'failed';
});

// ============================
// METHODS
// ============================
deploymentSchema.methods.addLog = function (message, level = 'info') {
  this.logs.push({ message, level, timestamp: new Date() });
  return this;
};

deploymentSchema.methods.markSuccess = function (data = {}) {
  this.status = 'success';
  this.progress = 100;
  this.completedAt = new Date();
  if (data.pterodactylServerId) this.pterodactylServerId = data.pterodactylServerId;
  if (data.pterodactylServerIdentifier) this.pterodactylServerIdentifier = data.pterodactylServerIdentifier;
  if (data.pterodactylServerUuid) this.pterodactylServerUuid = data.pterodactylServerUuid;
  return this;
};

deploymentSchema.methods.markFailed = function (errorMessage) {
  this.status = 'failed';
  this.errorMessage = errorMessage || 'Deployment imefail';
  this.completedAt = new Date();
  return this;
};

module.exports = mongoose.model('Deployment', deploymentSchema);
