/**
 * DVARY HOSTING
 * FILE: controllers/authController.js
 * Auth controller - register, login, logout
 */

'use strict';

const User = require('../models/User');
const logger = require('../utils/logger');

// ============================
// GET REGISTER PAGE
// ============================
exports.getRegister = (req, res) => {
  res.render('register', {
    title: 'Jisajili - DVARY HOSTING',
    errors: [],
    old: {},
  });
};

// ============================
// POST REGISTER
// ============================
exports.postRegister = async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;
  const errors = [];
  const old = { username, email };

  try {
    // Validation
    if (!username || username.trim().length < 3) {
      errors.push('Username iwe angalau herufi 3.');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('Email si sahihi.');
    }
    if (!password || password.length < 8) {
      errors.push('Password iwe angalau herufi 8.');
    }
    if (password !== confirmPassword) {
      errors.push('Password na confirm password hazifanani.');
    }

    if (errors.length > 0) {
      return res.status(400).render('register', {
        title: 'Jisajili - DVARY HOSTING',
        errors,
        old,
      });
    }

    // Check duplicates
    const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingEmail) {
      errors.push('Email hii imetumika tayari.');
    }

    const existingUsername = await User.findOne({ username: username.trim() });
    if (existingUsername) {
      errors.push('Username hii imetumika tayari.');
    }

    if (errors.length > 0) {
      return res.status(400).render('register', {
        title: 'Jisajili - DVARY HOSTING',
        errors,
        old,
      });
    }

    // Unda user
    const user = await User.create({
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: 'user',
      coins: 0,
      status: 'active',
    });

    logger.info(`User mpya amejisajili: ${user.username} (${user.email})`);

    req.flash('success', 'Umejisajili kwa mafanikio. Tafadhali ingia.');
    return res.redirect('/auth/login');
  } catch (err) {
    logger.error(`postRegister error: ${err.message}`);
    return res.status(500).render('register', {
      title: 'Jisajili - DVARY HOSTING',
      errors: ['Hitilafu imetokea. Tafadhali jaribu tena.'],
      old,
    });
  }
};

// ============================
// GET LOGIN PAGE
// ============================
exports.getLogin = (req, res) => {
  res.render('login', {
    title: 'Ingia - DVARY HOSTING',
    errors: [],
    old: {},
  });
};

// ============================
// POST LOGIN
// ============================
exports.postLogin = async (req, res) => {
  const { email, password } = req.body;
  const errors = [];
  const old = { email };

  try {
    if (!email || !password) {
      errors.push('Email na password vinahitajika.');
      return res.status(400).render('login', {
        title: 'Ingia - DVARY HOSTING',
        errors,
        old,
      });
    }

    // Tafuta user na password field
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user) {
      errors.push('Email au password si sahihi.');
      return res.status(401).render('login', {
        title: 'Ingia - DVARY HOSTING',
        errors,
        old,
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      errors.push('Email au password si sahihi.');
      return res.status(401).render('login', {
        title: 'Ingia - DVARY HOSTING',
        errors,
        old,
      });
    }

    if (user.status === 'banned') {
      errors.push('Akaunti yako imefungwa (banned).');
      return res.status(403).render('login', {
        title: 'Ingia - DVARY HOSTING',
        errors,
        old,
      });
    }

    if (user.status === 'suspended') {
      errors.push('Akaunti yako imesimamishwa. Wasiliana na admin.');
      return res.status(403).render('login', {
        title: 'Ingia - DVARY HOSTING',
        errors,
        old,
      });
    }

    // Update last login
    user.lastLogin = new Date();
    user.lastLoginIp = req.ip || req.connection.remoteAddress || null;
    await user.save();

    // Set session
    req.session.user = {
      _id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      coins: user.coins,
      status: user.status,
    };

    logger.info(`User ameingia: ${user.username} (role=${user.role})`);

    req.flash('success', `Karibu tena, ${user.username}!`);

    // Redirect kulingana na role
    if (user.role === 'admin') {
      return res.redirect('/admin/dashboard');
    }
    return res.redirect('/dashboard');
  } catch (err) {
    logger.error(`postLogin error: ${err.message}`);
    return res.status(500).render('login', {
      title: 'Ingia - DVARY HOSTING',
      errors: ['Hitilafu imetokea. Tafadhali jaribu tena.'],
      old,
    });
  }
};

// ============================
// LOGOUT
// ============================
exports.logout = (req, res) => {
  const username = req.session.user ? req.session.user.username : 'unknown';

  req.session.destroy((err) => {
    if (err) {
      logger.error(`logout session destroy error: ${err.message}`);
    }
    logger.info(`User ametoka: ${username}`);
    res.clearCookie('dvary.sid');
    res.redirect('/auth/login');
  });
};
