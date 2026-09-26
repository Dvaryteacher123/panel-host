/**
 * DVARY HOSTING
 * FILE: routes/admin.js
 * Admin routes - zote zinalindwa na requireAdmin
 */

'use strict';

const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/admin');

// ============================
// APPLY ADMIN MIDDLEWARE KWA ROUTES ZOTE
// ============================
router.use(requireAdmin);

// ============================
// DASHBOARD
// ============================
router.get('/', (req, res) => res.redirect('/admin/dashboard'));
router.get('/dashboard', adminController.getDashboard);

// ============================
// USERS
// ============================
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUserDetails);
router.post('/users/:id/status', adminController.postUpdateUserStatus);
router.post('/users/:id/role', adminController.postUpdateUserRole);

// ============================
// COINS (ADD / REMOVE)
// ============================
router.post('/coins/add', adminController.postAddCoins);
router.post('/coins/remove', adminController.postRemoveCoins);

// ============================
// BOTS
// ============================
router.get('/bots', adminController.getBots);
router.get('/bots/add', adminController.getAddBot);
router.post('/bots/add', adminController.postAddBot);
router.get('/bots/:id/edit', adminController.getEditBot);
router.post('/bots/:id/edit', adminController.postEditBot);
router.post('/bots/:id/delete', adminController.postDeleteBot);

// ============================
// HOSTING PLANS
// ============================
router.get('/hosting-plans', adminController.getHostingPlans);
router.get('/hosting-plans/add', adminController.getAddPlan);
router.post('/hosting-plans/add', adminController.postAddPlan);
router.get('/hosting-plans/:id/edit', adminController.getEditPlan);
router.post('/hosting-plans/:id/edit', adminController.postEditPlan);
router.post('/hosting-plans/:id/delete', adminController.postDeletePlan);

// ============================
// ADMIN PANELS
// ============================
router.get('/admin-panels', adminController.getAdminPanels);
router.get('/admin-panels/add', adminController.getAddPanel);
router.post('/admin-panels/add', adminController.postAddPanel);
router.get('/admin-panels/:id/edit', adminController.getEditPanel);
router.post('/admin-panels/:id/edit', adminController.postEditPanel);
router.post('/admin-panels/:id/delete', adminController.postDeletePanel);

// ============================
// DEPLOYMENTS (VIEW)
// ============================
router.get('/deployments', adminController.getDeployments);

// ============================
// SERVERS (VIEW + ACTIONS)
// ============================
router.get('/servers', adminController.getServers);
router.post('/servers/:id/suspend', adminController.postSuspendServer);
router.post('/servers/:id/unsuspend', adminController.postUnsuspendServer);
router.post('/servers/:id/delete', adminController.postDeleteServer);

// ============================
// TRANSACTIONS (VIEW)
// ============================
router.get('/transactions', adminController.getTransactions);

// ============================
// SETTINGS
// ============================
router.get('/settings', adminController.getSettings);
router.post('/settings/test-pterodactyl', adminController.postTestPterodactyl);

module.exports = router;
