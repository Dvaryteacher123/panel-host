/**
 * DVARY HOSTING
 * FILE: routes/dashboard.js
 * Dashboard routes za user (zinahitaji auth)
 */

'use strict';

const express = require('express');
const router = express.Router();

const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/auth');

// ============================
// APPLY AUTH MIDDLEWARE KWA ROUTES ZOTE
// ============================
router.use(requireAuth);

// ============================
// DASHBOARD
// ============================
router.get('/', dashboardController.getDashboard);

// ============================
// PROFILE
// ============================
router.get('/profile', dashboardController.getProfile);
router.post('/profile', dashboardController.postUpdateProfile);

// ============================
// SETTINGS
// ============================
router.get('/settings', dashboardController.getSettings);
router.post('/settings/password', dashboardController.postChangePassword);

module.exports = router;
