/**
 * DVARY HOSTING
 * FILE: middleware/admin.js
 * Admin middleware - inalinda routes za admin pekee
 */

'use strict';

const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Inahitaji user awe ameingia NA awe admin.
 * Vinginevyo:
 *  - Kama hajaingia → redirect /auth/login
 *  - Kama ni user wa kawaida → 403 / redirect dashboard
 */
async function requireAdmin(req, res, next) {
  try {
    if (!req.session || !req.session.user || !req.session.user._id) {
      req.flash('error', 'Tafadhali ingia kama admin kuendelea.');
      return res.redirect('/auth/login');
    }

    // Verify user bado ni admin
    const user = await User.findById(req.session.user._id);
    if (!user) {
      req.session.destroy(() => {});
      req.flash('error', 'Akaunti haipatikani. Tafadhali ingia tena.');
      return res.redirect('/auth/login');
    }

    if (user.role !== 'admin') {
      logger.warn(`User ${user.username} (${user._id}) amejaribu kufikia admin route: ${req.originalUrl}`);
      return res.status(403).render('404', {
        title: '403 - Hakuna Ruhusa',
        message: 'Hauna ruhusa kufikia ukurasa huu.',
      });
    }

    if (user.status !== 'active') {
      req.session.destroy(() => {});
      req.flash('error', 'Akaunti yako si active.');
      return res.redirect('/auth/login');
    }

    // Refresh session
    req.session.user = {
      _id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      coins: user.coins,
      status: user.status,
    };

    req.user = user;
    req.adminUser = user;
    res.locals.currentUser = req.session.user;
    res.locals.isAdmin = true;

    next();
  } catch (err) {
    logger.error(`requireAdmin error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea. Tafadhali jaribu tena.');
    return res.redirect('/auth/login');
  }
}

/**
 * API version - JSON response badala ya redirect.
 */
async function requireAdminApi(req, res, next) {
  try {
    if (!req.session || !req.session.user || !req.session.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Hakuna ruhusa. Ingia kama admin.',
      });
    }

    const user = await User.findById(req.session.user._id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Hauna ruhusa ya admin.',
      });
    }

    req.user = user;
    req.adminUser = user;
    next();
  } catch (err) {
    logger.error(`requireAdminApi error: ${err.message}`);
    return res.status(500).json({
      success: false,
      message: 'Hitilafu imetokea.',
    });
  }
}

module.exports = {
  requireAdmin,
  requireAdminApi,
};
