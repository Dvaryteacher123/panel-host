/**
 * DVARY HOSTING
 * FILE: controllers/coinController.js
 * Coin controller - user anaona balance, transactions history
 * Admin anaongeza/kuondoa coins
 */

'use strict';

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');

// ============================
// GET COINS PAGE (user)
// ============================
exports.getCoins = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) {
      req.flash('error', 'User haipatikani.');
      return res.redirect('/dashboard');
    }

    // Pata summary ya credits/debits
    const [credits, debits, totalTransactions] = await Promise.all([
      Transaction.getTotalCredits(user._id),
      Transaction.getTotalDebits(user._id),
      Transaction.countDocuments({ user: user._id }),
    ]);

    // Transactions za hivi karibuni
    const recentTransactions = await Transaction.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.render('coins', {
      title: 'Coins - DVARY HOSTING',
      user: req.user,
      balance: user.coins,
      summary: {
        credits,
        debits,
        totalTransactions,
      },
      recentTransactions,
    });
  } catch (err) {
    logger.error(`getCoins error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/dashboard');
  }
};

// ============================
// GET TRANSACTIONS PAGE (user)
// ============================
exports.getTransactions = async (req, res) => {
  try {
    const { type, reason, page } = req.query;
    const limit = 25;
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (currentPage - 1) * limit;

    const filter = { user: req.user._id };

    if (type && ['credit', 'debit'].includes(type)) {
      filter.type = type;
    }

    if (
      reason &&
      [
        'admin-add',
        'admin-remove',
        'bot-deployment',
        'server-purchase',
        'admin-panel-purchase',
        'refund',
        'other',
      ].includes(reason)
    ) {
      filter.reason = reason;
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('performedBy', 'username')
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.render('transactions', {
      title: 'Transactions - DVARY HOSTING',
      transactions,
      filters: {
        type: type || 'all',
        reason: reason || 'all',
      },
      pagination: {
        currentPage,
        totalPages,
        total,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
      },
      user: req.user,
    });
  } catch (err) {
    logger.error(`getTransactions error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/dashboard');
  }
};
