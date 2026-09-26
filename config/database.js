/**
 * DVARY HOSTING
 * File: config/database.js
 * MongoDB connection kwa kutumia Mongoose
 */

'use strict';

const mongoose = require('mongoose');
const logger = require('../utils/logger');

// ============================
// MONGOOSE SETTINGS
// ============================
mongoose.set('strictQuery', true);

// ============================
// CONNECT FUNCTION
// ============================
async function connectDatabase() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    logger.error('MONGO_URI haipo kwenye .env — MongoDB haitaunganishwa.');
    return;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 1,
      autoIndex: process.env.NODE_ENV !== 'production',
    });

    logger.info(`MongoDB imeunganishwa: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (err) {
    logger.error(`MongoDB connection imefail: ${err.message}`);
    // Hatu-exit — server inaendelea kufanya kazi lakini inaonyesha error
  }
}

// ============================
// CONNECTION EVENTS
// ============================
mongoose.connection.on('connected', () => {
  logger.info('Mongoose event: connected');
});

mongoose.connection.on('error', (err) => {
  logger.error(`Mongoose event: error — ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose event: disconnected');
});

mongoose.connection.on('reconnected', () => {
  logger.info('Mongoose event: reconnected');
});

// ============================
// GRACEFUL SHUTDOWN
// ============================
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection imefungwa (SIGINT).');
    process.exit(0);
  } catch (err) {
    logger.error(`Hitilafu kufunga MongoDB (SIGINT): ${err.message}`);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection imefungwa (SIGTERM).');
    process.exit(0);
  } catch (err) {
    logger.error(`Hitilafu kufunga MongoDB (SIGTERM): ${err.message}`);
    process.exit(1);
  }
});

module.exports = connectDatabase;
