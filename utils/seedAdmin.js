/**
 * DVARY HOSTING
 * FILE: utils/seedAdmin.js
 * Auto-unda admin wa kwanza kama hakuna admin yeyote kwenye DB
 */

'use strict';

const User = require('../models/User');
const logger = require('./logger');

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    logger.warn('ADMIN_EMAIL au ADMIN_PASSWORD haipo kwenye .env — admin seed imerukwa.');
    return null;
  }

  try {
    // Angalia kama kuna admin yeyote tayari
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      logger.info(`Admin tayari yupo: ${existingAdmin.email} — hakuna seed iliyofanyika.`);
      return existingAdmin;
    }

    // Angalia kama email hii ilishatumika (kama user wa kawaida)
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      // Promote kuwa admin
      existingUser.role = 'admin';
      existingUser.status = 'active';
      await existingUser.save();
      logger.success(`User "${existingUser.username}" amepandishwa kuwa ADMIN.`);
      return existingUser;
    }

    // Unda admin mpya
    // Tumia sehemu ya email kabla ya @ kama username
    let username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (username.length < 3) username = 'admin';

    // Hakikisha username haijatumika
    const usernameExists = await User.findOne({ username });
    if (usernameExists) {
      username = `${username}${Date.now().toString().slice(-4)}`;
    }

    const admin = await User.create({
      username,
      email: email.toLowerCase().trim(),
      password,
      role: 'admin',
      status: 'active',
      coins: 0,
    });

    logger.success(`✅ Admin wa kwanza ameundwa: ${admin.email} (username: ${admin.username})`);
    return admin;
  } catch (err) {
    logger.error(`seedAdmin error: ${err.message}`);
    return null;
  }
}

module.exports = seedAdmin;
