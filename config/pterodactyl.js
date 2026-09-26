/**
 * DVARY HOSTING
 * File: config/pterodactyl.js
 * Axios instance kwa Pterodactyl Application API
 */

'use strict';

const axios = require('axios');
const logger = require('../utils/logger');

// ============================
// ENV VARIABLES
// ============================
const PTERODACTYL_URL = process.env.PTERODACTYL_URL;
const PTERODACTYL_API_KEY = process.env.PTERODACTYL_API_KEY;

// ============================
// VALIDATION
// ============================
if (!PTERODACTYL_URL) {
  logger.warn('PTERODACTYL_URL haipo kwenye .env — Pterodactyl API haitafanya kazi.');
}

if (!PTERODACTYL_API_KEY) {
  logger.warn('PTERODACTYL_API_KEY haipo kwenye .env — Pterodactyl API haitafanya kazi.');
}

// ============================
// BASE URL
// ============================
const baseURL = PTERODACTYL_URL
  ? `${PTERODACTYL_URL.replace(/\/+$/, '')}/api/application`
  : '';

// ============================
// AXIOS INSTANCE
// ============================
const pterodactyl = axios.create({
  baseURL,
  timeout: 20000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: PTERODACTYL_API_KEY ? `Bearer ${PTERODACTYL_API_KEY}` : '',
  },
});

// ============================
// REQUEST INTERCEPTOR
// ============================
pterodactyl.interceptors.request.use(
  (config) => {
    if (!PTERODACTYL_URL || !PTERODACTYL_API_KEY) {
      const err = new Error('Pterodactyl API haijasanidiwa. Angalia .env (PTERODACTYL_URL, PTERODACTYL_API_KEY).');
      err.status = 503;
      return Promise.reject(err);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ============================
// RESPONSE INTERCEPTOR
// ============================
pterodactyl.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data || {};
      const message =
        (data.errors && data.errors[0] && data.errors[0].detail) ||
        data.error ||
        `Pterodactyl API error (${status})`;

      logger.error(`Pterodactyl API [${status}]: ${message}`);

      const wrapped = new Error(message);
      wrapped.status = status;
      wrapped.pterodactyl = data;
      return Promise.reject(wrapped);
    }

    if (error.request) {
      logger.error('Pterodactyl API: hakuna majibu kutoka server.');
      const wrapped = new Error('Pterodactyl API haipatikani kwa sasa.');
      wrapped.status = 503;
      return Promise.reject(wrapped);
    }

    logger.error(`Pterodactyl API hitilafu: ${error.message}`);
    return Promise.reject(error);
  }
);

// ============================
// HELPERS
// ============================
function isConfigured() {
  return Boolean(PTERODACTYL_URL && PTERODACTYL_API_KEY);
}

module.exports = pterodactyl;
module.exports.isConfigured = isConfigured;
module.exports.baseURL = baseURL;
