/**
 * DVARY HOSTING
 * FILE: routes/deploy.js
 * Deploy routes - bot deployment na deployment history
 */

'use strict';

const express = require('express');
const router = express.Router();

const deployController = require('../controllers/deployController');
const { requireAuth } = require('../middleware/auth');

// ============================
// APPLY AUTH MIDDLEWARE
// ============================
router.use(requireAuth);

// ============================
// DEPLOY PAGE
// ============================
router.get('/', deployController.getDeployPage);

// ============================
// CREATE DEPLOYMENT
// ============================
router.post('/', deployController.postDeploy);

// ============================
// DEPLOYMENT STATUS PAGE (dynamic)
// ============================
router.get('/status/:id', deployController.getDeployStatus);

// ============================
// DEPLOYMENT STATUS JSON (polling)
// ============================
router.get('/status-json/:id', deployController.getDeployStatusJson);

// ============================
// CANCEL DEPLOYMENT
// ============================
router.post('/cancel/:id', deployController.postCancelDeployment);

module.exports = router;
