/**
 * DVARY HOSTING
 * FILE: controllers/deployController.js
 * Deploy controller - kushughulikia bot deployment na deployment history
 */

'use strict';

const Bot = require('../models/Bot');
const Deployment = require('../models/Deployment');
const deploymentService = require('../services/deploymentService');
const logger = require('../utils/logger');

// ============================
// GET DEPLOY PAGE
// ============================
exports.getDeployPage = async (req, res) => {
  try {
    const { botId } = req.query;

    if (!botId) {
      req.flash('error', 'Chagua bot ku-deploy.');
      return res.redirect('/bots');
    }

    const bot = await Bot.findById(botId).lean();
    if (!bot) {
      req.flash('error', 'Bot haipatikani.');
      return res.redirect('/bots');
    }

    if (bot.status !== 'active') {
      req.flash('warning', 'Bot haipatikani kwa sasa.');
      return res.redirect('/bots');
    }

    // Angalia kama user ana coins za kutosha
    const canAfford = req.user.coins >= bot.price;

    res.render('deploy', {
      title: `Deploy ${bot.name} - DVARY HOSTING`,
      bot,
      user: req.user,
      canAfford,
    });
  } catch (err) {
    logger.error(`getDeployPage error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/bots');
  }
};

// ============================
// POST DEPLOY (create deployment)
// ============================
exports.postDeploy = async (req, res) => {
  try {
    const { botId } = req.body;

    if (!botId) {
      req.flash('error', 'Bot ID inahitajika.');
      return res.redirect('/bots');
    }

    const result = await deploymentService.deployBot(req.user, botId);

    logger.info(`Deployment imefanikiwa kwa user=${req.user._id}, deployment=${result.deployment._id}`);

    req.flash('success', result.message || 'Deployment imefanikiwa.');
    return res.redirect(`/deploy/status/${result.deployment._id}`);
  } catch (err) {
    logger.error(`postDeploy error: ${err.message}`);
    req.flash('error', err.message || 'Deployment imefail.');

    // Kama deployment record iliundwa, tupeleke kwenye status page
    if (err.deployment && err.deployment._id) {
      return res.redirect(`/deploy/status/${err.deployment._id}`);
    }

    return res.redirect('/bots');
  }
};

// ============================
// GET DEPLOYMENT STATUS PAGE
// ============================
exports.getDeployStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const deployment = await Deployment.findOne({
      _id: id,
      user: req.user._id,
    })
      .populate('bot', 'name image category')
      .lean();

    if (!deployment) {
      req.flash('error', 'Deployment haipatikani.');
      return res.redirect('/deployments');
    }

    res.render('deploy', {
      title: `Deployment Status - DVARY HOSTING`,
      deployment,
      bot: deployment.bot,
      user: req.user,
      isStatusPage: true,
      canAfford: false,
    });
  } catch (err) {
    logger.error(`getDeployStatus error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/deployments');
  }
};

// ============================
// GET DEPLOYMENT STATUS JSON (kwa polling)
// ============================
exports.getDeployStatusJson = async (req, res) => {
  try {
    const { id } = req.params;

    const deployment = await Deployment.findOne({
      _id: id,
      user: req.user._id,
    }).lean();

    if (!deployment) {
      return res.status(404).json({
        success: false,
        message: 'Deployment haipatikani.',
      });
    }

    return res.json({
      success: true,
      deployment: {
        _id: deployment._id,
        status: deployment.status,
        progress: deployment.progress,
        errorMessage: deployment.errorMessage,
        logs: deployment.logs,
        pterodactylServerIdentifier: deployment.pterodactylServerIdentifier,
        completedAt: deployment.completedAt,
      },
    });
  } catch (err) {
    logger.error(`getDeployStatusJson error: ${err.message}`);
    return res.status(500).json({
      success: false,
      message: 'Hitilafu imetokea.',
    });
  }
};

// ============================
// GET ALL MY DEPLOYMENTS
// ============================
exports.getDeployments = async (req, res) => {
  try {
    const { status, page } = req.query;
    const limit = 20;
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (currentPage - 1) * limit;

    const filter = { user: req.user._id };
    if (status && ['pending', 'processing', 'success', 'failed', 'cancelled'].includes(status)) {
      filter.status = status;
    }

    const [deployments, total] = await Promise.all([
      Deployment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('bot', 'name image category')
        .lean(),
      Deployment.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.render('deployments', {
      title: 'My Deployments - DVARY HOSTING',
      deployments,
      filters: { status: status || 'all' },
      pagination: {
        currentPage,
        totalPages,
        total,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
      },
      user: req.user,
    });
  } catch (err) {
    logger.error(`getDeployments error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/dashboard');
  }
};

// ============================
// POST CANCEL DEPLOYMENT (kama bado pending)
// ============================
exports.postCancelDeployment = async (req, res) => {
  try {
    const { id } = req.params;

    const deployment = await Deployment.findOne({
      _id: id,
      user: req.user._id,
    });

    if (!deployment) {
      req.flash('error', 'Deployment haipatikani.');
      return res.redirect('/deployments');
    }

    if (!['pending', 'processing'].includes(deployment.status)) {
      req.flash('error', 'Deployment hii haiwezi kusitishwa.');
      return res.redirect('/deployments');
    }

    deployment.status = 'cancelled';
    deployment.addLog('Deployment imesitishwa na user.', 'warn');
    await deployment.save();

    req.flash('success', 'Deployment imesitishwa.');
    res.redirect('/deployments');
  } catch (err) {
    logger.error(`postCancelDeployment error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/deployments');
  }
};
