/**
 * DVARY HOSTING
 * FILE: middleware/auth.js
 * Authentication middleware - inalinda routes zinazohitaji user aliyeingia
 */

'use strict';

const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Inahitaji user awe ameingia. Vinginevyo redirect /auth/login.
 */
async function requireAuth(req, res, next) {
  try {
    if (!req.session || !req.session.user || !req.session.user._id) {
      req.flash('error', 'Tafadhali ingia kwanza kuendelea.');
      return res.redirect('/auth/login');
    }

    // Verify user bado yupo na active
    const user = await User.findById(req.session.user._id);
    if (!user) {
      req.session.destroy(() => {});
      req.flash('error', 'Akaunti haipatikani. Tafadhali ingia tena.');
      return res.redirect('/auth/login');
    }

    if (user.status === 'banned') {
      req.session.destroy(() => {});
      req.flash('error', 'Akaunti yako imefungwa (banned).');
      return res.redirect('/auth/login');
    }

    if (user.status === 'suspended') {
      req.flash('warning', 'Akaunti yako imesimamishwa. Wasiliana na admin.');
      return res.redirect('/auth/login');
    }

    // Refresh session user
    req.session.user = {
      _id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      coins: user.coins,
      status: user.status,
    };

    req.user = user;
    res.locals.currentUser = req.session.user;
    res.locals.isAdmin = user.role === 'admin';

    next();
  } catch (err) {
    logger.error(`requireAuth error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea. Tafadhali jaribu tena.');
    return res.redirect('/auth/login');
  }
}

/**
 * Kama user ameingia tayari, mpeleke dashboard (kwa login/register pages).
 */
function redirectIfAuth(req, res, next) {
  if (req.session && req.session.user && req.session.user._id) {
    return res.redirect('/dashboard');
  }
  next();
}

/**
 * Inahitaji user awe ameingia (API version - JSON response).
 */
function requireAuthApi(req, res, next) {
  if (!req.session || !req.session.user || !req.session.user._id) {
    return res.status(401).json({
      success: false,
      message: 'Hakuna ruhusa. Ingia kwanza.',
    });
  }
  next();
}

module.exports = {
  requireAuth,
  redirectIfAuth,
  requireAuthApi,
};
