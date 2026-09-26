/**
 * DVARY HOSTING
 * FILE: controllers/dashboardController.js
 * Dashboard controller ya user (na homepage)
 */

'use strict';

const User = require('../models/User');
const Bot = require('../models/Bot');
const Server = require('../models/Server');
const Deployment = require('../models/Deployment');
const Transaction = require('../models/Transaction');
const HostingPlan = require('../models/HostingPlan');
const AdminPanel = require('../models/AdminPanel');
const logger = require('../utils/logger');

// ============================
// GET HOMEPAGE (public)
// ============================
exports.getHome = async (req, res) => {
  try {
    const [totalBots, totalPlans, totalPanels] = await Promise.all([
      Bot.countDocuments({ status: 'active' }),
      HostingPlan.countDocuments({ status: 'active' }),
      AdminPanel.countDocuments({ status: 'active' }),
    ]);

    const featuredBots = await Bot.find({ status: 'active', featured: true })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    res.render('index', {
      title: 'DVARY HOSTING - Deploy Bots, Buy Servers, Admin Panels',
      stats: {
        totalBots,
        totalPlans,
        totalPanels,
      },
      featuredBots,
    });
  } catch (err) {
    logger.error(`getHome error: ${err.message}`);
    res.render('index', {
      title: 'DVARY HOSTING',
      stats: { totalBots: 0, totalPlans: 0, totalPanels: 0 },
      featuredBots: [],
    });
  }
};

// ============================
// GET USER DASHBOARD
// ============================
exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user._id;

    const [deploymentsCount, serversCount, recentDeployments, recentServers, recentTransactions] =
      await Promise.all([
        Deployment.countDocuments({ user: userId }),
        Server.countDocuments({ user: userId, status: { $ne: 'deleted' } }),
        Deployment.find({ user: userId })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate('bot', 'name image category')
          .lean(),
        Server.find({ user: userId, status: { $ne: 'deleted' } })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean(),
        Transaction.find({ user: userId })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean(),
      ]);

    const activeServers = await Server.countDocuments({ user: userId, status: 'active' });
    const suspendedServers = await Server.countDocuments({ user: userId, status: 'suspended' });

    res.render('dashboard', {
      title: 'Dashboard - DVARY HOSTING',
      user: req.user,
      stats: {
        deploymentsCount,
        serversCount,
        activeServers,
        suspendedServers,
        coins: req.user.coins,
      },
      recentDeployments,
      recentServers,
      recentTransactions,
    });
  } catch (err) {
    logger.error(`getDashboard error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea kupakia dashboard.');
    res.redirect('/');
  }
};

// ============================
// GET PROFILE
// ============================
exports.getProfile = async (req, res) => {
  try {
    res.render('profile', {
      title: 'Profile - DVARY HOSTING',
      user: req.user,
    });
  } catch (err) {
    logger.error(`getProfile error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/dashboard');
  }
};

// ============================
// GET SETTINGS
// ============================
exports.getSettings = async (req, res) => {
  try {
    res.render('settings', {
      title: 'Settings - DVARY HOSTING',
      user: req.user,
    });
  } catch (err) {
    logger.error(`getSettings error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/dashboard');
  }
};

// ============================
// POST UPDATE PROFILE
// ============================
exports.postUpdateProfile = async (req, res) => {
  try {
    const { username, phone, country } = req.body;

    if (!username || username.trim().length < 3) {
      req.flash('error', 'Username iwe angalau herufi 3.');
      return res.redirect('/dashboard/profile');
    }

    // Check duplicate username
    if (username.trim() !== req.user.username) {
      const existing = await User.findOne({ username: username.trim(), _id: { $ne: req.user._id } });
      if (existing) {
        req.flash('error', 'Username hii imetumika tayari.');
        return res.redirect('/dashboard/profile');
      }
    }

    req.user.username = username.trim();
    req.user.phone = phone ? phone.trim() : null;
    req.user.country = country ? country.trim() : null;
    await req.user.save();

    // Update session
    req.session.user.username = req.user.username;

    req.flash('success', 'Profile imeupdate.');
    res.redirect('/dashboard/profile');
  } catch (err) {
    logger.error(`postUpdateProfile error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/dashboard/profile');
  }
};

// ============================
// POST CHANGE PASSWORD
// ============================
exports.postChangePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      req.flash('error', 'Sehemu zote zinahitajika.');
      return res.redirect('/dashboard/settings');
    }

    if (newPassword.length < 8) {
      req.flash('error', 'Password mpya iwe angalau herufi 8.');
      return res.redirect('/dashboard/settings');
    }

    if (newPassword !== confirmPassword) {
      req.flash('error', 'Password mpya na confirm hazifanani.');
      return res.redirect('/dashboard/settings');
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      req.flash('error', 'User haipatikani.');
      return res.redirect('/dashboard/settings');
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      req.flash('error', 'Password ya sasa si sahihi.');
      return res.redirect('/dashboard/settings');
    }

    user.password = newPassword;
    await user.save();

    req.flash('success', 'Password imebadilishwa.');
    res.redirect('/dashboard/settings');
  } catch (err) {
    logger.error(`postChangePassword error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/dashboard/settings');
  }
};
