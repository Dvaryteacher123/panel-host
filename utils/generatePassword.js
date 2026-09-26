/**
 * DVARY HOSTING
 * FILE: utils/generatePassword.js
 * Password generator kwa Pterodactyl user accounts
 */

'use strict';

const crypto = require('crypto');

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const NUMBERS = '0123456789';
const SYMBOLS = '!@#$%^&*';
const ALL = UPPERCASE + LOWERCASE + NUMBERS + SYMBOLS;

/**
 * Chagua character mmoja random kutoka string
 */
function randomChar(str) {
  return str[crypto.randomInt(0, str.length)];
}

/**
 * Generate password yenye urefu maalum
 * Kila category ina angalau character mmoja
 */
function generatePassword(length = 16) {
  if (typeof length !== 'number' || length < 8) {
    length = 16;
  }

  const required = [
    randomChar(UPPERCASE),
    randomChar(LOWERCASE),
    randomChar(NUMBERS),
    randomChar(SYMBOLS),
  ];

  const remaining = [];
  for (let i = 0; i < length - required.length; i++) {
    remaining.push(randomChar(ALL));
  }

  const all = [...required, ...remaining];

  // Fisher-Yates shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }

  return all.join('');
}

/**
 * Generate username salama kwa Pterodactyl (letters, numbers, underscore)
 */
function generateUsername(base, length = 12) {
  const clean = String(base || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 8);

  const suffix = crypto.randomInt(1000, 9999).toString();
  const username = `${clean || 'user'}${suffix}`;

  return username.substring(0, length);
}

/**
 * Generate random token (kwa future use)
 */
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = {
  generatePassword,
  generateUsername,
  generateToken,
};
