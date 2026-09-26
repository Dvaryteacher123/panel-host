/**
 * DVARY HOSTING
 * FILE: routes/bots.js
 * Bot routes - user anaona bots na details zake
 */

'use strict';

const express = require('express');
const router = express.Router();

const botController = require('../controllers/botController');
const { requireAuth } = require('../middleware/auth');

// ============================
// APPLY AUTH MIDDLEWARE
// ============================
router.use(requireAuth);

// ============================
// BOTS LIST
// ============================
router.get('/', botController.getBots);

// ============================
// BOT DETAILS
// ============================
router.get('/:id', botController.getBotDetails);

module.exports = router;
