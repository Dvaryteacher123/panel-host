/**
 * DVARY HOSTING
 * FILE: routes/servers.js
 * Server routes - buy server, my servers, admin panels marketplace, my panels
 */

'use strict';

const express = require('express');
const router = express.Router();

const serverController = require('../controllers/serverController');
const { requireAuth } = require('../middleware/auth');

// ============================
// APPLY AUTH MIDDLEWARE
// ============================
router.use(requireAuth);

// ============================
// BUY SERVER (hosting plans)
// ============================
router.get('/buy', serverController.getBuyServer);
router.post('/buy', serverController.postBuyServer);

// ============================
// ADMIN PANELS MARKETPLACE
// ============================
router.get('/admin-panels', serverController.getAdminPanels);
router.post('/admin-panels/buy', serverController.postBuyAdminPanel);

// ============================
// MY PANELS
// ============================
router.get('/my-panels', serverController.getMyPanels);

// ============================
// MY SERVERS (list)
// ============================
router.get('/', serverController.getServers);

// ============================
// SERVER DETAILS & ACTIONS
// ============================
router.get('/:id', serverController.getServerDetails);
router.post('/:id/suspend', serverController.postSuspendServer);
router.post('/:id/unsuspend', serverController.postUnsuspendServer);

module.exports = router;
