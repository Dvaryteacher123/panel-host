/**
 * DVARY HOSTING
 * FILE: routes/auth.js
 * Auth routes - register, login, logout
 */

'use strict';

const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { redirectIfAuth } = require('../middleware/auth');

// ============================
// REGISTER
// ============================
router.get('/register', redirectIfAuth, authController.getRegister);
router.post('/register', redirectIfAuth, authController.postRegister);

// ============================
// LOGIN
// ============================
router.get('/login', redirectIfAuth, authController.getLogin);
router.post('/login', redirectIfAuth, authController.postLogin);

// ============================
// LOGOUT
// ============================
router.post('/logout', authController.logout);
router.get('/logout', authController.logout);

module.exports = router;
