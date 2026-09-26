/**
 * DVARY HOSTING
 * FILE: models/Transaction.js
 * Transaction model - kumbukumbu ya kila coin transaction (add/remove/spend)
 */

'use strict';

const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User inahitajika'],
      index: true,
    },

    // ============================
    // AINA YA TRANSACTION
    // ============================
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: [true, 'Aina ya transaction inahitajika'],
    },

    // ============================
    // SABABU
    // ============================
    reason: {
      type: String,
      enum: [
        'admin-add',
        'admin-remove',
        'bot-deployment',
        'server-purchase',
        'admin-panel-purchase',
        'refund',
        'other',
      ],
      required: [true, 'Sababu inahitajika'],
      index: true,
    },

    // ============================
    // KIASI
    // ============================
    amount: {
      type: Number,
      required: [true, 'Kiasi kinahitajika'],
      min: [0, 'Kiasi hakiwezi kuwa chini ya 0'],
    },

    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },

    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },

    // ============================
    // MAELEZO
    // ============================
    description: {
      type: String,
      trim: true,
      default: null,
      maxlength: [500, 'Maelezo yasizidi herufi 500'],
    },

    // ============================
    // REFERENCE (kama ni deployment/server purchase)
    // ============================
    referenceModel: {
      type: String,
      enum: ['Deployment', 'Server', 'AdminPanel', 'HostingPlan', null],
      default: null,
    },

    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // ============================
// ADMIN ALIYEFANYA (kama ni admin action)
    // ============================
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // ============================
    // STATUS
    // ============================
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'reversed'],
      default: 'completed',
      index: true,
    },

    metadata: {
      type: Map,
      of: String,
      default: {},
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
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });
transactionSchema.index({ reason: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });

// ============================
// VIRTUALS
// ============================
transactionSchema.virtual('isCredit').get(function () {
  return this.type === 'credit';
});

transactionSchema.virtual('isDebit').get(function () {
  return this.type === 'debit';
});

transactionSchema.virtual('signedAmount').get(function () {
  return this.type === 'credit' ? this.amount : -this.amount;
});

// ============================
// STATICS
// ============================
transactionSchema.statics.getUserHistory = function (userId, limit = 50) {
  return this.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('performedBy', 'username email')
    .lean();
};

transactionSchema.statics.getTotalCredits = async function (userId) {
  const result = await this.aggregate([
    { $match: { user: userId, type: 'credit', status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return result[0] ? result[0].total : 0;
};

transactionSchema.statics.getTotalDebits = async function (userId) {
  const result = await this.aggregate([
    { $match: { user: userId, type: 'debit', status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return result[0] ? result[0].total : 0;
};

module.exports = mongoose.model('Transaction', transactionSchema);
