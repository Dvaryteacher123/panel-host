/**
 * DVARY HOSTING
 * FILE: routes/coins.js
 * Coin routes - user anaona balance na transactions history
 */

'use strict';

const express = require('express');
const router = express.Router();

const coinController = require('../controllers/coinController');
const { requireAuth } = require('../middleware/auth');

// ============================
// APPLY AUTH MIDDLEWARE
// ============================
router.use(requireAuth);

// ============================
// COINS PAGE
// ============================
router.get('/', coinController.getCoins);

// ============================
// TRANSACTIONS HISTORY
// ============================
router.get('/transactions', coinController.getTransactions);

module.exports = router;
