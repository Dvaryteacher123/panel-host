/**
 * DVARY HOSTING
 * FILE: controllers/adminController.js
 * Admin controller - dashboard, users, bots, plans, panels, servers,
 * deployments, transactions, coins management
 */

'use strict';

const mongoose = require('mongoose');

const User = require('../models/User');
const Bot = require('../models/Bot');
const Server = require('../models/Server');
const Deployment = require('../models/Deployment');
const HostingPlan = require('../models/HostingPlan');
const AdminPanel = require('../models/AdminPanel');
const Transaction = require('../models/Transaction');

const deploymentService = require('../services/deploymentService');
const pterodactylService = require('../services/pterodactylService');
const githubService = require('../services/githubService');
const logger = require('../utils/logger');

// ============================
// HELPERS
// ============================
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function safeCounts() {
  const [users, bots, servers, deployments, plans, panels, transactions, activeServers] =
    await Promise.all([
      User.countDocuments(),
      Bot.countDocuments(),
      Server.countDocuments({ status: { $ne: 'deleted' } }),
      Deployment.countDocuments(),
      HostingPlan.countDocuments(),
      AdminPanel.countDocuments(),
      Transaction.countDocuments(),
      Server.countDocuments({ status: 'active' }),
    ]);

  return { users, bots, servers, deployments, plans, panels, transactions, activeServers };
}

// ============================
// ADMIN DASHBOARD
// ============================
exports.getDashboard = async (req, res) => {
  try {
    const stats = await safeCounts();

    const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5).lean();
    const recentDeployments = await Deployment.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'username email')
      .populate('bot', 'name')
      .lean();
    const recentServers = await Server.find({ status: { $ne: 'deleted' } })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'username email')
      .lean();
    const recentTransactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'username email')
      .lean();

    // Pterodactyl health
    let pterodactylOnline = false;
    let pterodactylError = null;
    try {
      pterodactylOnline = await pterodactylService.healthCheck();
    } catch (err) {
      pterodactylError = err.message;
    }

    res.render('admin/dashboard', {
      title: 'Admin Dashboard - DVARY HOSTING',
      stats,
      recentUsers,
      recentDeployments,
      recentServers,
      recentTransactions,
      pterodactylOnline,
      pterodactylError,
      user: req.adminUser,
    });
  } catch (err) {
    logger.error(`admin.getDashboard error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/dashboard');
  }
};

// ============================
// USERS
// ============================
exports.getUsers = async (req, res) => {
  try {
    const { search, status, role, page } = req.query;
    const limit = 20;
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (currentPage - 1) * limit;

    const filter = {};
    if (status && ['active', 'suspended', 'banned'].includes(status)) filter.status = status;
    if (role && ['user', 'admin'].includes(role)) filter.role = role;
    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { username: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.render('admin/users', {
      title: 'Users - Admin',
      users,
      filters: { search: search || '', status: status || 'all', role: role || 'all' },
      pagination: {
        currentPage,
        totalPages,
        total,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
      },
      user: req.adminUser,
    });
  } catch (err) {
    logger.error(`admin.getUsers error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/dashboard');
  }
};

exports.getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      req.flash('error', 'User ID si sahihi.');
      return res.redirect('/admin/users');
    }

    const userDoc = await User.findById(id).lean();
    if (!userDoc) {
      req.flash('error', 'User haipatikani.');
      return res.redirect('/admin/users');
    }

    const [servers, deployments, transactions, totalCredits, totalDebits] = await Promise.all([
      Server.find({ user: id, status: { $ne: 'deleted' } }).sort({ createdAt: -1 }).limit(10).lean(),
      Deployment.find({ user: id }).sort({ createdAt: -1 }).limit(10).populate('bot', 'name').lean(),
      Transaction.find({ user: id }).sort({ createdAt: -1 }).limit(20).lean(),
      Transaction.getTotalCredits(id),
      Transaction.getTotalDebits(id),
    ]);

    res.render('admin/user-details', {
      title: `${userDoc.username} - Admin`,
      targetUser: userDoc,
      servers,
      deployments,
      transactions,
      summary: { totalCredits, totalDebits },
      user: req.adminUser,
    });
  } catch (err) {
    logger.error(`admin.getUserDetails error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/users');
  }
};

exports.postUpdateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidObjectId(id)) {
      req.flash('error', 'User ID si sahihi.');
      return res.redirect('/admin/users');
    }

    if (!['active', 'suspended', 'banned'].includes(status)) {
      req.flash('error', 'Status si sahihi.');
      return res.redirect(`/admin/users/${id}`);
    }

    const userDoc = await User.findById(id);
    if (!userDoc) {
      req.flash('error', 'User haipatikani.');
      return res.redirect('/admin/users');
    }

    if (userDoc.role === 'admin' && status !== 'active') {
      req.flash('error', 'Hauwezi kusimamisha admin mwingine.');
      return res.redirect(`/admin/users/${id}`);
    }

    userDoc.status = status;
    await userDoc.save();

    req.flash('success', `Status ya user imekuwa "${status}".`);
    res.redirect(`/admin/users/${id}`);
  } catch (err) {
    logger.error(`admin.postUpdateUserStatus error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/users');
  }
};

exports.postUpdateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!isValidObjectId(id)) {
      req.flash('error', 'User ID si sahihi.');
      return res.redirect('/admin/users');
    }

    if (!['user', 'admin'].includes(role)) {
      req.flash('error', 'Role si sahihi.');
      return res.redirect(`/admin/users/${id}`);
    }

    if (id === req.adminUser._id.toString() && role !== 'admin') {
      req.flash('error', 'Hauwezi kujiondoa admin role mwenyewe.');
      return res.redirect(`/admin/users/${id}`);
    }

    const userDoc = await User.findById(id);
    if (!userDoc) {
      req.flash('error', 'User haipatikani.');
      return res.redirect('/admin/users');
    }

    userDoc.role = role;
    await userDoc.save();

    req.flash('success', `Role imekuwa "${role}".`);
    res.redirect(`/admin/users/${id}`);
  } catch (err) {
    logger.error(`admin.postUpdateUserRole error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/users');
  }
};

// ============================
// COINS MANAGEMENT
// ============================
exports.postAddCoins = async (req, res) => {
  try {
    const { userId, amount, description } = req.body;
    const redirectTo = req.body.redirectTo || `/admin/users/${userId}`;

    if (!isValidObjectId(userId)) {
      req.flash('error', 'User ID si sahihi.');
      return res.redirect('/admin/users');
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      req.flash('error', 'Kiasi kiwe namba zaidi ya 0.');
      return res.redirect(redirectTo);
    }

    const result = await deploymentService.adminAddCoins({
      targetUserId: userId,
      amount: amt,
      adminId: req.adminUser._id,
      description: description || null,
    });

    req.flash(
      'success',
      `Coins ${amt} zimeongezwa kwa ${result.user.username}. Balance mpya: ${result.user.coins}`
    );
    res.redirect(redirectTo);
  } catch (err) {
    logger.error(`admin.postAddCoins error: ${err.message}`);
    req.flash('error', err.message || 'Hitilafu imetokea.');
    res.redirect(req.body.redirectTo || '/admin/users');
  }
};

exports.postRemoveCoins = async (req, res) => {
  try {
    const { userId, amount, description } = req.body;
    const redirectTo = req.body.redirectTo || `/admin/users/${userId}`;

    if (!isValidObjectId(userId)) {
      req.flash('error', 'User ID si sahihi.');
      return res.redirect('/admin/users');
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      req.flash('error', 'Kiasi kiwe namba zaidi ya 0.');
      return res.redirect(redirectTo);
    }

    const result = await deploymentService.adminRemoveCoins({
      targetUserId: userId,
      amount: amt,
      adminId: req.adminUser._id,
      description: description || null,
    });

    req.flash(
      'success',
      `Coins ${amt} zimeondolewa kwa ${result.user.username}. Balance mpya: ${result.user.coins}`
    );
    res.redirect(redirectTo);
  } catch (err) {
    logger.error(`admin.postRemoveCoins error: ${err.message}`);
    req.flash('error', err.message || 'Hitilafu imetokea.');
    res.redirect(req.body.redirectTo || '/admin/users');
  }
};

// ============================
// BOTS CRUD
// ============================
exports.getBots = async (req, res) => {
  try {
    const { search, category, status } = req.query;

    const filter = {};
    if (category && category !== 'all') filter.category = category.toLowerCase();
    if (status && ['active', 'inactive'].includes(status)) filter.status = status;
    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
      ];
    }

    const bots = await Bot.find(filter).sort({ createdAt: -1 }).lean();
    const categories = await Bot.distinct('category');

    res.render('admin/bots', {
      title: 'Bots - Admin',
      bots,
      categories: categories.filter(Boolean),
      filters: {
        search: search || '',
        category: category || 'all',
        status: status || 'all',
      },
      user: req.adminUser,
    });
  } catch (err) {
    logger.error(`admin.getBots error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/dashboard');
  }
};

exports.getAddBot = (req, res) => {
  res.render('admin/add-bot', {
    title: 'Add Bot - Admin',
    errors: [],
    old: {},
    user: req.adminUser,
  });
};

exports.postAddBot = async (req, res) => {
  const errors = [];
  const old = req.body;

  try {
    const {
      name,
      description,
      shortDescription,
      image,
      category,
      tags,
      githubUrl,
      githubBranch,
      price,
      ram,
      cpu,
      disk,
      nestId,
      eggId,
      dockerImage,
      startupCommand,
      status,
      featured,
    } = req.body;

    // Validation
    if (!name || name.trim().length < 2) errors.push('Jina linahitajika (angalau herufi 2).');
    if (!description || description.trim().length < 10) errors.push('Maelezo yanahitajika.');
    if (!category || category.trim().length < 2) errors.push('Category inahitajika.');
    if (!githubUrl || !githubService.isValidGithubUrl(githubUrl)) {
      errors.push('GitHub URL si sahihi (mfano: https://github.com/user/repo).');
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) errors.push('Bei si sahihi.');
    const ramNum = Number(ram);
    if (!Number.isFinite(ramNum) || ramNum <= 0) errors.push('RAM si sahihi.');
    const cpuNum = Number(cpu);
    if (!Number.isFinite(cpuNum) || cpuNum <= 0) errors.push('CPU si sahihi.');
    const diskNum = Number(disk);
    if (!Number.isFinite(diskNum) || diskNum <= 0) errors.push('Disk si sahihi.');
    if (!eggId) errors.push('Egg ID inahitajika.');
    if (!nestId) errors.push('Nest ID inahitajika.');
    if (!dockerImage) errors.push('Docker image inahitajika.');
    if (!startupCommand) errors.push('Startup command inahitajika.');

    if (errors.length > 0) {
      return res.status(400).render('admin/add-bot', {
        title: 'Add Bot - Admin',
        errors,
        old,
        user: req.adminUser,
      });
    }

    // Environment variables (kutoka textarea: KEY=VALUE kwa kila mstari)
    const envVars = {};
    if (req.body.environmentVariables && typeof req.body.environmentVariables === 'string') {
      req.body.environmentVariables.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          const value = trimmed.slice(idx + 1).trim();
          if (key) envVars[key] = value;
        }
      });
    }

    // Tags (comma separated)
    const tagsArray = tags
      ? String(tags)
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      : [];

    const bot = await Bot.create({
      name: name.trim(),
      description: description.trim(),
      shortDescription: shortDescription ? shortDescription.trim() : null,
      image: image ? image.trim() : null,
      category: category.trim().toLowerCase(),
      tags: tagsArray,
      githubUrl: githubUrl.trim(),
      githubBranch: githubBranch ? githubBranch.trim() : 'main',
      price: priceNum,
      ram: ramNum,
      cpu: cpuNum,
      disk: diskNum,
      nestId: Number(nestId) || null,
      eggId: Number(eggId) || null,
      dockerImage: dockerImage.trim(),
      startupCommand: startupCommand.trim(),
      environmentVariables: envVars,
      status: status === 'inactive' ? 'inactive' : 'active',
      featured: featured === 'on' || featured === 'true',
      createdBy: req.adminUser._id,
    });

    logger.info(`Bot imeongezwa na admin: ${bot.name} (${bot._id})`);

    req.flash('success', `Bot "${bot.name}" imeongezwa.`);
    res.redirect('/admin/bots');
  } catch (err) {
    logger.error(`admin.postAddBot error: ${err.message}`);
    errors.push(err.message || 'Hitilafu imetokea.');
    res.status(500).render('admin/add-bot', {
      title: 'Add Bot - Admin',
      errors,
      old,
      user: req.adminUser,
    });
  }
};

exports.getEditBot = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      req.flash('error', 'Bot ID si sahihi.');
      return res.redirect('/admin/bots');
    }

    const bot = await Bot.findById(id).lean();
    if (!bot) {
      req.flash('error', 'Bot haipatikani.');
      return res.redirect('/admin/bots');
    }

    // Convert Map → plain object for the form
    const envVars = bot.environmentVariables || {};

    res.render('admin/edit-bot', {
      title: `Edit ${bot.name} - Admin`,
      bot,
      envVars,
      errors: [],
      old: {},
      user: req.adminUser,
    });
  } catch (err) {
    logger.error(`admin.getEditBot error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/bots');
  }
};

exports.postEditBot = async (req, res) => {
  const errors = [];

  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      req.flash('error', 'Bot ID si sahihi.');
      return res.redirect('/admin/bots');
    }

    const bot = await Bot.findById(id);
    if (!bot) {
      req.flash('error', 'Bot haipatikani.');
      return res.redirect('/admin/bots');
    }

    const {
      name,
      description,
      shortDescription,
      image,
      category,
      tags,
      githubUrl,
      githubBranch,
      price,
      ram,
      cpu,
      disk,
      nestId,
      eggId,
      dockerImage,
      startupCommand,
      status,
      featured,
    } = req.body;

    if (!name || name.trim().length < 2) errors.push('Jina linahitajika.');
    if (!description || description.trim().length < 10) errors.push('Maelezo yanahitajika.');
    if (!category) errors.push('Category inahitajika.');
    if (!githubUrl || !githubService.isValidGithubUrl(githubUrl)) {
      errors.push('GitHub URL si sahihi.');
    }

    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) errors.push('Bei si sahihi.');
    const ramNum = Number(ram);
    if (!Number.isFinite(ramNum) || ramNum <= 0) errors.push('RAM si sahihi.');
    const cpuNum = Number(cpu);
    if (!Number.isFinite(cpuNum) || cpuNum <= 0) errors.push('CPU si sahihi.');
    const diskNum = Number(disk);
    if (!Number.isFinite(diskNum) || diskNum <= 0) errors.push('Disk si sahihi.');

    if (errors.length > 0) {
      const envVars = bot.environmentVariables || {};
      return res.status(400).render('admin/edit-bot', {
        title: `Edit ${bot.name} - Admin`,
        bot: { ...bot.toObject(), ...req.body },
        envVars,
        errors,
        old: req.body,
        user: req.adminUser,
      });
    }

    const envVars = {};
    if (req.body.environmentVariables && typeof req.body.environmentVariables === 'string') {
      req.body.environmentVariables.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          const value = trimmed.slice(idx + 1).trim();
          if (key) envVars[key] = value;
        }
      });
    }

    const tagsArray = tags
      ? String(tags)
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      : [];

    bot.name = name.trim();
    bot.description = description.trim();
    bot.shortDescription = shortDescription ? shortDescription.trim() : null;
    bot.image = image ? image.trim() : null;
    bot.category = category.trim().toLowerCase();
    bot.tags = tagsArray;
    bot.githubUrl = githubUrl.trim();
    bot.githubBranch = githubBranch ? githubBranch.trim() : 'main';
    bot.price = priceNum;
    bot.ram = ramNum;
    bot.cpu = cpuNum;
    bot.disk = diskNum;
    bot.nestId = Number(nestId) || null;
    bot.eggId = Number(eggId) || null;
    bot.dockerImage = dockerImage ? dockerImage.trim() : null;
    bot.startupCommand = startupCommand ? startupCommand.trim() : null;
    bot.environmentVariables = envVars;
    bot.status = status === 'inactive' ? 'inactive' : 'active';
    bot.featured = featured === 'on' || featured === 'true';

    await bot.save();

    logger.info(`Bot imeupdate: ${bot.name} (${bot._id})`);
    req.flash('success', `Bot "${bot.name}" imeupdate.`);
    res.redirect('/admin/bots');
  } catch (err) {
    logger.error(`admin.postEditBot error: ${err.message}`);
    req.flash('error', err.message || 'Hitilafu imetokea.');
    res.redirect('/admin/bots');
  }
};

exports.postDeleteBot = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      req.flash('error', 'Bot ID si sahihi.');
      return res.redirect('/admin/bots');
    }

    const bot = await Bot.findById(id);
    if (!bot) {
      req.flash('error', 'Bot haipatikani.');
      return res.redirect('/admin/bots');
    }

    // Angalia kama kuna deployments zinazohusiana
    const deploymentsCount = await Deployment.countDocuments({ bot: bot._id });
    if (deploymentsCount > 0) {
      // Badala ya kufuta, weka inactive
      bot.status = 'inactive';
      await bot.save();
      req.flash(
        'warning',
        `Bot "${bot.name}" imewekwa inactive kwa sababu ina deployments ${deploymentsCount}.`
      );
      return res.redirect('/admin/bots');
    }

    await Bot.findByIdAndDelete(id);
    logger.info(`Bot imefutwa: ${bot.name} (${bot._id})`);
    req.flash('success', `Bot "${bot.name}" imefutwa.`);
    res.redirect('/admin/bots');
  } catch (err) {
    logger.error(`admin.postDeleteBot error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/bots');
  }
};

// ============================
// HOSTING PLANS CRUD
// ============================
exports.getHostingPlans = async (req, res) => {
  try {
    const { search, status } = req.query;
    const filter = {};
    if (status && ['active', 'inactive'].includes(status)) filter.status = status;
    if (search && search.trim()) {
      filter.name = { $regex: search.trim(), $options: 'i' };
    }

    const plans = await HostingPlan.find(filter).sort({ createdAt: -1 }).lean();

    res.render('admin/hosting-plans', {
      title: 'Hosting Plans - Admin',
      plans,
      filters: { search: search || '', status: status || 'all' },
      user: req.adminUser,
    });
  } catch (err) {
    logger.error(`admin.getHostingPlans error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/dashboard');
  }
};

exports.getAddPlan = (req, res) => {
  res.render('admin/add-plan', {
    title: 'Add Hosting Plan - Admin',
    errors: [],
    old: {},
    user: req.adminUser,
  });
};

exports.postAddPlan = async (req, res) => {
  const errors = [];
  const old = req.body;

  try {
    const {
      name,
      description,
      shortDescription,
      image,
      ram,
      cpu,
      disk,
      price,
      nodeId,
      nestId,
      eggId,
      allocationId,
      dockerImage,
      startupCommand,
      status,
      featured,
      stock,
    } = req.body;

    if (!name || name.trim().length < 2) errors.push('Jina linahitajika.');
    if (!description || description.trim().length < 10) errors.push('Maelezo yanahitajika.');

    const ramNum = Number(ram);
    const cpuNum = Number(cpu);
    const diskNum = Number(disk);
    const priceNum = Number(price);

    if (!Number.isFinite(ramNum) || ramNum <= 0) errors.push('RAM si sahihi.');
    if (!Number.isFinite(cpuNum) || cpuNum <= 0) errors.push('CPU si sahihi.');
    if (!Number.isFinite(diskNum) || diskNum <= 0) errors.push('Disk si sahihi.');
    if (!Number.isFinite(priceNum) || priceNum < 0) errors.push('Bei si sahihi.');

    if (!nodeId) errors.push('Node ID inahitajika.');
    if (!nestId) errors.push('Nest ID inahitajika.');
    if (!eggId) errors.push('Egg ID inahitajika.');
    if (!dockerImage) errors.push('Docker image inahitajika.');
    if (!startupCommand) errors.push('Startup command inahitajika.');

    if (errors.length > 0) {
      return res.status(400).render('admin/add-plan', {
        title: 'Add Hosting Plan - Admin',
        errors,
        old,
        user: req.adminUser,
      });
    }

    const envVars = {};
    if (req.body.environmentVariables && typeof req.body.environmentVariables === 'string') {
      req.body.environmentVariables.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          const value = trimmed.slice(idx + 1).trim();
          if (key) envVars[key] = value;
        }
      });
    }

    const plan = await HostingPlan.create({
      name: name.trim(),
      description: description.trim(),
      shortDescription: shortDescription ? shortDescription.trim() : null,
      image: image ? image.trim() : null,
      ram: ramNum,
      cpu: cpuNum,
      disk: diskNum,
      price: priceNum,
      nodeId: Number(nodeId) || null,
      nestId: Number(nestId) || null,
      eggId: Number(eggId) || null,
      allocationId: allocationId ? Number(allocationId) : null,
      dockerImage: dockerImage.trim(),
      startupCommand: startupCommand.trim(),
      environmentVariables: envVars,
      status: status === 'inactive' ? 'inactive' : 'active',
      featured: featured === 'on' || featured === 'true',
      stock: stock !== '' && stock !== undefined ? Number(stock) : null,
      createdBy: req.adminUser._id,
    });

    logger.info(`Hosting plan imeongezwa: ${plan.name} (${plan._id})`);
    req.flash('success', `Plan "${plan.name}" imeongezwa.`);
    res.redirect('/admin/hosting-plans');
  } catch (err) {
    logger.error(`admin.postAddPlan error: ${err.message}`);
    errors.push(err.message || 'Hitilafu imetokea.');
    res.status(500).render('admin/add-plan', {
      title: 'Add Hosting Plan - Admin',
      errors,
      old,
      user: req.adminUser,
    });
  }
};

exports.getEditPlan = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      req.flash('error', 'Plan ID si sahihi.');
      return res.redirect('/admin/hosting-plans');
    }

    const plan = await HostingPlan.findById(id).lean();
    if (!plan) {
      req.flash('error', 'Plan haipatikani.');
      return res.redirect('/admin/hosting-plans');
    }

    res.render('admin/add-plan', {
      title: `Edit ${plan.name} - Admin`,
      plan,
      errors: [],
      old: {},
      isEdit: true,
      user: req.adminUser,
    });
  } catch (err) {
    logger.error(`admin.getEditPlan error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/hosting-plans');
  }
};

exports.postEditPlan = async (req, res) => {
  const errors = [];

  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      req.flash('error', 'Plan ID si sahihi.');
      return res.redirect('/admin/hosting-plans');
    }

    const plan = await HostingPlan.findById(id);
    if (!plan) {
      req.flash('error', 'Plan haipatikani.');
      return res.redirect('/admin/hosting-plans');
    }

    const {
      name,
      description,
      shortDescription,
      image,
      ram,
      cpu,
      disk,
      price,
      nodeId,
      nestId,
      eggId,
      allocationId,
      dockerImage,
      startupCommand,
      status,
      featured,
      stock,
    } = req.body;

    if (!name || name.trim().length < 2) errors.push('Jina linahitajika.');
    if (!description || description.trim().length < 10) errors.push('Maelezo yanahitajika.');

    const ramNum = Number(ram);
    const cpuNum = Number(cpu);
    const diskNum = Number(disk);
    const priceNum = Number(price);

    if (!Number.isFinite(ramNum) || ramNum <= 0) errors.push('RAM si sahihi.');
    if (!Number.isFinite(cpuNum) || cpuNum <= 0) errors.push('CPU si sahihi.');
    if (!Number.isFinite(diskNum) || diskNum <= 0) errors.push('Disk si sahihi.');
    if (!Number.isFinite(priceNum) || priceNum < 0) errors.push('Bei si sahihi.');

    if (errors.length > 0) {
      return res.status(400).render('admin/add-plan', {
        title: `Edit ${plan.name} - Admin`,
        plan: { ...plan.toObject(), ...req.body },
        errors,
        old: req.body,
        isEdit: true,
        user: req.adminUser,
      });
    }

    const envVars = {};
    if (req.body.environmentVariables && typeof req.body.environmentVariables === 'string') {
      req.body.environmentVariables.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          const value = trimmed.slice(idx + 1).trim();
          if (key) envVars[key] = value;
        }
      });
    }

    plan.name = name.trim();
    plan.description = description.trim();
    plan.shortDescription = shortDescription ? shortDescription.trim() : null;
    plan.image = image ? image.trim() : null;
    plan.ram = ramNum;
    plan.cpu = cpuNum;
    plan.disk = diskNum;
    plan.price = priceNum;
    plan.nodeId = Number(nodeId) || null;
    plan.nestId = Number(nestId) || null;
    plan.eggId = Number(eggId) || null;
    plan.allocationId = allocationId ? Number(allocationId) : null;
    plan.dockerImage = dockerImage ? dockerImage.trim() : null;
    plan.startupCommand = startupCommand ? startupCommand.trim() : null;
    plan.environmentVariables = envVars;
    plan.status = status === 'inactive' ? 'inactive' : 'active';
    plan.featured = featured === 'on' || featured === 'true';
    plan.stock = stock !== '' && stock !== undefined ? Number(stock) : null;

    await plan.save();

    logger.info(`Plan imeupdate: ${plan.name} (${plan._id})`);
    req.flash('success', `Plan "${plan.name}" imeupdate.`);
    res.redirect('/admin/hosting-plans');
  } catch (err) {
    logger.error(`admin.postEditPlan error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/hosting-plans');
  }
};

exports.postDeletePlan = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      req.flash('error', 'Plan ID si sahihi.');
      return res.redirect('/admin/hosting-plans');
    }

    const plan = await HostingPlan.findById(id);
    if (!plan) {
      req.flash('error', 'Plan haipatikani.');
      return res.redirect('/admin/hosting-plans');
    }

    const serversCount = await Server.countDocuments({ hostingPlan: plan._id });
    if (serversCount > 0) {
      plan.status = 'inactive';
      await plan.save();
      req.flash(
        'warning',
        `Plan "${plan.name}" imewekwa inactive kwa sababu ina servers ${serversCount}.`
      );
      return res.redirect('/admin/hosting-plans');
    }

    await HostingPlan.findByIdAndDelete(id);
    logger.info(`Plan imefutwa: ${plan.name}`);
    req.flash('success', `Plan "${plan.name}" imefutwa.`);
    res.redirect('/admin/hosting-plans');
  } catch (err) {
    logger.error(`admin.postDeletePlan error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/hosting-plans');
  }
};

// ============================
// ADMIN PANELS CRUD
// ============================
exports.getAdminPanels = async (req, res) => {
  try {
    const { search, status } = req.query;
    const filter = {};
    if (status && ['active', 'inactive'].includes(status)) filter.status = status;
    if (search && search.trim()) {
      filter.name = { $regex: search.trim(), $options: 'i' };
    }

    const panels = await AdminPanel.find(filter).sort({ createdAt: -1 }).lean();

    res.render('admin/admin-panels', {
      title: 'Admin Panels - Admin',
      panels,
      filters: { search: search || '', status: status || 'all' },
      user: req.adminUser,
    });
  } catch (err) {
    logger.error(`admin.getAdminPanels error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/dashboard');
  }
};

exports.getAddPanel = (req, res) => {
  res.render('admin/add-panel', {
    title: 'Add Admin Panel - Admin',
    errors: [],
    old: {},
    user: req.adminUser,
  });
};

exports.postAddPanel = async (req, res) => {
  const errors = [];
  const old = req.body;

  try {
    const {
      name,
      description,
      shortDescription,
      image,
      category,
      tags,
      price,
      downloadUrl,
      deploymentInfo,
      status,
      featured,
      stock,
    } = req.body;

    if (!name || name.trim().length < 2) errors.push('Jina linahitajika.');
    if (!description || description.trim().length < 10) errors.push('Maelezo yanahitajika.');

    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) errors.push('Bei si sahihi.');

    if (errors.length > 0) {
      return res.status(400).render('admin/add-panel', {
        title: 'Add Admin Panel - Admin',
        errors,
        old,
        user: req.adminUser,
      });
    }

    const tagsArray = tags
      ? String(tags)
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      : [];

    const panel = await AdminPanel.create({
      name: name.trim(),
      description: description.trim(),
      shortDescription: shortDescription ? shortDescription.trim() : null,
      image: image ? image.trim() : null,
      category: category ? category.trim().toLowerCase() : null,
      tags: tagsArray,
      price: priceNum,
      downloadUrl: downloadUrl ? downloadUrl.trim() : null,
      deploymentInfo: deploymentInfo ? deploymentInfo.trim() : null,
      status: status === 'inactive' ? 'inactive' : 'active',
      featured: featured === 'on' || featured === 'true',
      stock: stock !== '' && stock !== undefined ? Number(stock) : null,
      createdBy: req.adminUser._id,
    });

    logger.info(`Admin panel imeongezwa: ${panel.name} (${panel._id})`);
    req.flash('success', `Panel "${panel.name}" imeongezwa.`);
    res.redirect('/admin/admin-panels');
  } catch (err) {
    logger.error(`admin.postAddPanel error: ${err.message}`);
    errors.push(err.message || 'Hitilafu imetokea.');
    res.status(500).render('admin/add-panel', {
      title: 'Add Admin Panel - Admin',
      errors,
      old,
      user: req.adminUser,
    });
  }
};

exports.getEditPanel = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      req.flash('error', 'Panel ID si sahihi.');
      return res.redirect('/admin/admin-panels');
    }

    const panel = await AdminPanel.findById(id).lean();
    if (!panel) {
      req.flash('error', 'Panel haipatikani.');
      return res.redirect('/admin/admin-panels');
    }

    res.render('admin/add-panel', {
      title: `Edit ${panel.name} - Admin`,
      panel,
      errors: [],
      old: {},
      isEdit: true,
      user: req.adminUser,
    });
  } catch (err) {
    logger.error(`admin.getEditPanel error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/admin-panels');
  }
};

exports.postEditPanel = async (req, res) => {
  const errors = [];

  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      req.flash('error', 'Panel ID si sahihi.');
      return res.redirect('/admin/admin-panels');
    }

    const panel = await AdminPanel.findById(id);
    if (!panel) {
      req.flash('error', 'Panel haipatikani.');
      return res.redirect('/admin/admin-panels');
    }

    const {
      name,
      description,
      shortDescription,
      image,
      category,
      tags,
      price,
      downloadUrl,
      deploymentInfo,
      status,
      featured,
      stock,
    } = req.body;

    if (!name || name.trim().length < 2) errors.push('Jina linahitajika.');
    if (!description || description.trim().length < 10) errors.push('Maelezo yanahitajika.');

    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) errors.push('Bei si sahihi.');

    if (errors.length > 0) {
      return res.status(400).render('admin/add-panel', {
        title: `Edit ${panel.name} - Admin`,
        panel: { ...panel.toObject(), ...req.body },
        errors,
        old: req.body,
        isEdit: true,
        user: req.adminUser,
      });
    }

    const tagsArray = tags
      ? String(tags)
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      : [];

    panel.name = name.trim();
    panel.description = description.trim();
    panel.shortDescription = shortDescription ? shortDescription.trim() : null;
    panel.image = image ? image.trim() : null;
    panel.category = category ? category.trim().toLowerCase() : null;
    panel.tags = tagsArray;
    panel.price = priceNum;
    panel.downloadUrl = downloadUrl ? downloadUrl.trim() : null;
    panel.deploymentInfo = deploymentInfo ? deploymentInfo.trim() : null;
    panel.status = status === 'inactive' ? 'inactive' : 'active';
    panel.featured = featured === 'on' || featured === 'true';
    panel.stock = stock !== '' && stock !== undefined ? Number(stock) : null;

    await panel.save();

    logger.info(`Panel imeupdate: ${panel.name} (${panel._id})`);
    req.flash('success', `Panel "${panel.name}" imeupdate.`);
    res.redirect('/admin/admin-panels');
  } catch (err) {
    logger.error(`admin.postEditPanel error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/admin-panels');
  }
};

exports.postDeletePanel = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      req.flash('error', 'Panel ID si sahihi.');
      return res.redirect('/admin/admin-panels');
    }

    const panel = await AdminPanel.findById(id);
    if (!panel) {
      req.flash('error', 'Panel haipatikani.');
      return res.redirect('/admin/admin-panels');
    }

    // Kama panel imenunuliwa, weka inactive
    const purchases = await Transaction.countDocuments({
      reason: 'admin-panel-purchase',
      referenceId: panel._id,
    });

    if (purchases > 0) {
      panel.status = 'inactive';
      await panel.save();
      req.flash(
        'warning',
        `Panel "${panel.name}" imewekwa inactive kwa sababu imenunuliwa mara ${purchases}.`
      );
      return res.redirect('/admin/admin-panels');
    }

    await AdminPanel.findByIdAndDelete(id);
    logger.info(`Panel imefutwa: ${panel.name}`);
    req.flash('success', `Panel "${panel.name}" imefutwa.`);
    res.redirect('/admin/admin-panels');
  } catch (err) {
    logger.error(`admin.postDeletePanel error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/admin-panels');
  }
};

// ============================
// DEPLOYMENTS (VIEW)
// ============================
exports.getDeployments = async (req, res) => {
  try {
    const { status, page } = req.query;
    const limit = 20;
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (currentPage - 1) * limit;

    const filter = {};
    if (status && ['pending', 'processing', 'success', 'failed', 'cancelled'].includes(status)) {
      filter.status = status;
    }

    const [deployments, total] = await Promise.all([
      Deployment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'username email')
        .populate('bot', 'name')
        .lean(),
      Deployment.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.render('admin/deployments', {
      title: 'Deployments - Admin',
      deployments,
      filters: { status: status || 'all' },
      pagination: {
        currentPage,
        totalPages,
        total,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
      },
      user: req.adminUser,
    });
  } catch (err) {
    logger.error(`admin.getDeployments error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/dashboard');
  }
};

// ============================
// SERVERS (VIEW)
// ============================
exports.getServers = async (req, res) => {
  try {
    const { status, page } = req.query;
    const limit = 20;
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (currentPage - 1) * limit;

    const filter = { status: { $ne: 'deleted' } };
    if (status && ['creating', 'active', 'suspended', 'failed'].includes(status)) {
      filter.status = status;
    }

    const [servers, total] = await Promise.all([
      Server.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'username email')
        .lean(),
      Server.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.render('admin/servers', {
      title: 'Servers - Admin',
      servers,
      filters: { status: status || 'all' },
      pagination: {
        currentPage,
        totalPages,
        total,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
      },
      user: req.adminUser,
    });
  } catch (err) {
    logger.error(`admin.getServers error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/dashboard');
  }
};

exports.postSuspendServer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      req.flash('error', 'Server ID si sahihi.');
      return res.redirect('/admin/servers');
    }

    const server = await Server.findById(id);
    if (!server) {
      req.flash('error', 'Server haipatikani.');
      return res.redirect('/admin/servers');
    }

    if (!server.pterodactylServerId) {
      req.flash('error', 'Server haina Pterodactyl ID.');
      return res.redirect('/admin/servers');
    }

    try {
      await pterodactylService.suspendServer(server.pterodactylServerId);
    } catch (apiErr) {
      logger.error(`admin suspend API error: ${apiErr.message}`);
      req.flash('error', `Pterodactyl: ${apiErr.message}`);
      return res.redirect('/admin/servers');
    }

    server.markSuspended('Imesimamishwa na admin');
    await server.save();

    req.flash('success', 'Server imesimamishwa.');
    res.redirect('/admin/servers');
  } catch (err) {
    logger.error(`admin.postSuspendServer error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/servers');
  }
};

exports.postUnsuspendServer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      req.flash('error', 'Server ID si sahihi.');
      return res.redirect('/admin/servers');
    }

    const server = await Server.findById(id);
    if (!server) {
      req.flash('error', 'Server haipatikani.');
      return res.redirect('/admin/servers');
    }

    if (!server.pterodactylServerId) {
      req.flash('error', 'Server haina Pterodactyl ID.');
      return res.redirect('/admin/servers');
    }

    try {
      await pterodactylService.unsuspendServer(server.pterodactylServerId);
    } catch (apiErr) {
      logger.error(`admin unsuspend API error: ${apiErr.message}`);
      req.flash('error', `Pterodactyl: ${apiErr.message}`);
      return res.redirect('/admin/servers');
    }

    server.markUnsuspended();
    await server.save();

    req.flash('success', 'Server imeanzishwa tena.');
    res.redirect('/admin/servers');
  } catch (err) {
    logger.error(`admin.postUnsuspendServer error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/servers');
  }
};

exports.postDeleteServer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      req.flash('error', 'Server ID si sahihi.');
      return res.redirect('/admin/servers');
    }

    const server = await Server.findById(id);
    if (!server) {
      req.flash('error', 'Server haipatikani.');
      return res.redirect('/admin/servers');
    }

    if (server.pterodactylServerId) {
      try {
        await pterodactylService.deleteServer(server.pterodactylServerId);
      } catch (apiErr) {
        logger.error(`admin delete server API error: ${apiErr.message}`);
        req.flash('warning', `Pterodactyl delete imefail: ${apiErr.message}. Server imewekwa deleted kwenye DB.`);
      }
    }

    server.status = 'deleted';
    await server.save();

    req.flash('success', 'Server imefutwa.');
    res.redirect('/admin/servers');
  } catch (err) {
    logger.error(`admin.postDeleteServer error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/servers');
  }
};

// ============================
// TRANSACTIONS (VIEW)
// ============================
exports.getTransactions = async (req, res) => {
  try {
    const { type, reason, page } = req.query;
    const limit = 25;
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (currentPage - 1) * limit;

    const filter = {};
    if (type && ['credit', 'debit'].includes(type)) filter.type = type;
    if (
      reason &&
      [
        'admin-add',
        'admin-remove',
        'bot-deployment',
        'server-purchase',
        'admin-panel-purchase',
        'refund',
        'other',
      ].includes(reason)
    ) {
      filter.reason = reason;
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'username email')
        .populate('performedBy', 'username')
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.render('admin/transactions', {
      title: 'Transactions - Admin',
      transactions,
      filters: { type: type || 'all', reason: reason || 'all' },
      pagination: {
        currentPage,
        totalPages,
        total,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
      },
      user: req.adminUser,
    });
  } catch (err) {
    logger.error(`admin.getTransactions error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/dashboard');
  }
};

// ============================
// SETTINGS
// ============================
exports.getSettings = async (req, res) => {
  try {
    let pterodactylOnline = false;
    let pterodactylError = null;
    let nodes = [];
    let nests = [];

    try {
      pterodactylOnline = await pterodactylService.healthCheck();
    } catch (err) {
      pterodactylError = err.message;
    }

    if (pterodactylOnline) {
      try {
        nodes = await pterodactylService.getNodes();
      } catch (e) {
        logger.warn(`getSettings getNodes warn: ${e.message}`);
      }
      try {
        nests = await pterodactylService.getNests();
      } catch (e) {
        logger.warn(`getSettings getNests warn: ${e.message}`);
      }
    }

    res.render('admin/settings', {
      title: 'Settings - Admin',
      pterodactylOnline,
      pterodactylError,
      nodes,
      nests,
      envInfo: {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: process.env.PORT || '3000',
        pterodactylUrl: process.env.PTERODACTYL_URL ? 'imewekwa' : 'HAIPO',
        pterodactylKey: process.env.PTERODACTYL_API_KEY ? 'imewekwa' : 'HAIPO',
        mongoUri: process.env.MONGO_URI ? 'imewekwa' : 'HAIPO',
      },
      user: req.adminUser,
    });
  } catch (err) {
    logger.error(`admin.getSettings error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/admin/dashboard');
  }
};

exports.postTestPterodactyl = async (req, res) => {
  try {
    const online = await pterodactylService.healthCheck();
    if (online) {
      req.flash('success', 'Pterodactyl API inafanya kazi.');
    } else {
      req.flash('error', 'Pterodactyl API haipatikani. Angalia .env.');
    }
    res.redirect('/admin/settings');
  } catch (err) {
    logger.error(`admin.postTestPterodactyl error: ${err.message}`);
    req.flash('error', `Pterodactyl: ${err.message}`);
    res.redirect('/admin/settings');
  }
};
