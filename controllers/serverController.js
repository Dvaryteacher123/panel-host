/**
 * DVARY HOSTING
 * FILE: controllers/serverController.js
 * Server controller - buy server, my servers, view details, actions
 */

'use strict';

const Server = require('../models/Server');
const HostingPlan = require('../models/HostingPlan');
const AdminPanel = require('../models/AdminPanel');
const Transaction = require('../models/Transaction');
const deploymentService = require('../services/deploymentService');
const pterodactylService = require('../services/pterodactylService');
const logger = require('../utils/logger');

// ============================
// GET BUY SERVER PAGE (hosting plans list)
// ============================
exports.getBuyServer = async (req, res) => {
  try {
    const plans = await HostingPlan.find({ status: 'active' })
      .sort({ featured: -1, price: 1, createdAt: -1 })
      .lean();

    res.render('buy-server', {
      title: 'Buy Server - DVARY HOSTING',
      plans,
      user: req.user,
    });
  } catch (err) {
    logger.error(`getBuyServer error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea kupakia plans.');
    res.redirect('/dashboard');
  }
};

// ============================
// POST BUY SERVER (purchase hosting plan)
// ============================
exports.postBuyServer = async (req, res) => {
  try {
    const { planId } = req.body;

    if (!planId) {
      req.flash('error', 'Chagua plan.');
      return res.redirect('/servers/buy');
    }

    const result = await deploymentService.buyHostingPlan(req.user, planId);

    logger.info(`Server imenunuliwa: user=${req.user._id}, server=${result.server._id}`);

    req.flash('success', result.message || 'Server imenunuliwa kwa mafanikio.');
    return res.redirect('/servers');
  } catch (err) {
    logger.error(`postBuyServer error: ${err.message}`);
    req.flash('error', err.message || 'Purchase imefail.');
    return res.redirect('/servers/buy');
  }
};

// ============================
// GET MY SERVERS
// ============================
exports.getServers = async (req, res) => {
  try {
    const { status } = req.query;

    const filter = { user: req.user._id, status: { $ne: 'deleted' } };
    if (status && ['creating', 'active', 'suspended', 'failed'].includes(status)) {
      filter.status = status;
    }

    const servers = await Server.find(filter)
      .sort({ createdAt: -1 })
      .populate('hostingPlan', 'name image')
      .populate('bot', 'name image')
      .populate('adminPanel', 'name image')
      .lean();

    res.render('servers', {
      title: 'My Servers - DVARY HOSTING',
      servers,
      filters: { status: status || 'all' },
      user: req.user,
    });
  } catch (err) {
    logger.error(`getServers error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/dashboard');
  }
};

// ============================
// GET SERVER DETAILS
// ============================
exports.getServerDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const server = await Server.findOne({
      _id: id,
      user: req.user._id,
    })
      .populate('hostingPlan', 'name image')
      .populate('bot', 'name image')
      .populate('adminPanel', 'name image')
      .lean();

    if (!server) {
      req.flash('error', 'Server haipatikani.');
      return res.redirect('/servers');
    }

    // Jaribu kupata live status kutoka Pterodactyl (usi-vunje kama API haipatikani)
    let liveStatus = null;
    let liveError = null;
    if (server.pterodactylServerId) {
      try {
        const live = await pterodactylService.getServer(server.pterodactylServerId);
        liveStatus = {
          status: live.status,
          suspended: live.suspended,
          name: live.name,
          identifier: live.identifier,
          uuid: live.uuid,
          limits: live.limits,
        };
      } catch (apiErr) {
        liveError = apiErr.message;
        logger.warn(`Live server fetch warn (id=${server._id}): ${apiErr.message}`);
      }
    }

    res.render('servers', {
      title: `${server.name} - DVARY HOSTING`,
      servers: [server],
      singleServer: server,
      liveStatus,
      liveError,
      filters: { status: 'all' },
      user: req.user,
    });
  } catch (err) {
    logger.error(`getServerDetails error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/servers');
  }
};

// ============================
// POST SUSPEND SERVER (user action — kama atakubali)
// ============================
exports.postSuspendServer = async (req, res) => {
  try {
    const { id } = req.params;

    const server = await Server.findOne({
      _id: id,
      user: req.user._id,
    });

    if (!server) {
      req.flash('error', 'Server haipatikani.');
      return res.redirect('/servers');
    }

    if (server.status !== 'active') {
      req.flash('error', 'Server hii haiwezi kusimamishwa kwa sasa.');
      return res.redirect('/servers');
    }

    if (!server.pterodactylServerId) {
      req.flash('error', 'Server haina Pterodactyl ID.');
      return res.redirect('/servers');
    }

    try {
      await pterodactylService.suspendServer(server.pterodactylServerId);
    } catch (apiErr) {
      logger.error(`suspendServer API error: ${apiErr.message}`);
      req.flash('error', `Pterodactyl: ${apiErr.message}`);
      return res.redirect('/servers');
    }

    server.markSuspended('Imesimamishwa na user');
    await server.save();

    req.flash('success', 'Server imesimamishwa.');
    res.redirect(`/servers/${server._id}`);
  } catch (err) {
    logger.error(`postSuspendServer error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/servers');
  }
};

// ============================
// POST UNSUSPEND SERVER
// ============================
exports.postUnsuspendServer = async (req, res) => {
  try {
    const { id } = req.params;

    const server = await Server.findOne({
      _id: id,
      user: req.user._id,
    });

    if (!server) {
      req.flash('error', 'Server haipatikani.');
      return res.redirect('/servers');
    }

    if (server.status !== 'suspended') {
      req.flash('error', 'Server hii haijasimamishwa.');
      return res.redirect('/servers');
    }

    if (!server.pterodactylServerId) {
      req.flash('error', 'Server haina Pterodactyl ID.');
      return res.redirect('/servers');
    }

    try {
      await pterodactylService.unsuspendServer(server.pterodactylServerId);
    } catch (apiErr) {
      logger.error(`unsuspendServer API error: ${apiErr.message}`);
      req.flash('error', `Pterodactyl: ${apiErr.message}`);
      return res.redirect('/servers');
    }

    server.markUnsuspended();
    await server.save();

    req.flash('success', 'Server imeanzishwa tena.');
    res.redirect(`/servers/${server._id}`);
  } catch (err) {
    logger.error(`postUnsuspendServer error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/servers');
  }
};

// ============================
// GET ADMIN PANELS (marketplace)
// ============================
exports.getAdminPanels = async (req, res) => {
  try {
    const { search, category } = req.query;

    const filter = { status: 'active' };
    if (category && category !== 'all') filter.category = category.toLowerCase();
    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } },
      ];
    }

    const panels = await AdminPanel.find(filter).sort({ featured: -1, createdAt: -1 }).lean();
    const categories = await AdminPanel.distinct('category', { status: 'active' });

    res.render('admin-panels', {
      title: 'Admin Panels - DVARY HOSTING',
      panels,
      categories: categories.filter(Boolean),
      filters: {
        category: category || 'all',
        search: search || '',
      },
      user: req.user,
    });
  } catch (err) {
    logger.error(`getAdminPanels error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/dashboard');
  }
};

// ============================
// POST BUY ADMIN PANEL
// ============================
exports.postBuyAdminPanel = async (req, res) => {
  try {
    const { panelId } = req.body;

    if (!panelId) {
      req.flash('error', 'Chagua panel.');
      return res.redirect('/servers/admin-panels');
    }

    const result = await deploymentService.buyAdminPanel(req.user, panelId);

    logger.info(`Admin panel imenunuliwa: user=${req.user._id}, panel=${result.panel._id}`);

    req.flash('success', result.message || 'Admin panel imenunuliwa.');
    return res.redirect('/servers/my-panels');
  } catch (err) {
    logger.error(`postBuyAdminPanel error: ${err.message}`);
    req.flash('error', err.message || 'Purchase imefail.');
    return res.redirect('/servers/admin-panels');
  }
};

// ============================
// GET MY PANELS (purchased admin panels)
// ============================
exports.getMyPanels = async (req, res) => {
  try {
    // Pata transactions za user za admin-panel-purchase
    const transactions = await Transaction.find({
      user: req.user._id,
      reason: 'admin-panel-purchase',
      status: 'completed',
    })
      .sort({ createdAt: -1 })
      .populate({
        path: 'referenceId',
        model: 'AdminPanel',
      })
      .lean();

    // Chuja zile zenye panel halisi
    const myPanels = transactions
      .filter((t) => t.referenceId)
      .map((t) => ({
        transaction: {
          _id: t._id,
          amount: t.amount,
          createdAt: t.createdAt,
          description: t.description,
        },
        panel: t.referenceId,
      }));

    res.render('my-panels', {
      title: 'My Panels - DVARY HOSTING',
      myPanels,
      user: req.user,
    });
  } catch (err) {
    logger.error(`getMyPanels error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/dashboard');
  }
};
