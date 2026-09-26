/**
 * DVARY HOSTING
 * FILE: routes/index.js
 * Homepage na routes za umma (public)
 */

'use strict';

const express = require('express');
const router = express.Router();

const dashboardController = require('../controllers/dashboardController');

// ============================
// HOMEPAGE
// ============================
router.get('/', dashboardController.getHome);

// ============================
// HEALTH CHECK
// ============================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    app: 'DVARY HOSTING',
    status: 'online',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
