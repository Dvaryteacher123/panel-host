/**
 * DVARY HOSTING
 * FILE: controllers/botController.js
 * Bot controller - user anaona bots, admin ana-manage bots
 */

'use strict';

const Bot = require('../models/Bot');
const Deployment = require('../models/Deployment');
const logger = require('../utils/logger');

// ============================
// GET ALL BOTS (user view)
// ============================
exports.getBots = async (req, res) => {
  try {
    const { category, search, sort } = req.query;

    const filter = { status: 'active' };

    if (category && category !== 'all') {
      filter.category = category.toLowerCase();
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } },
      ];
    }

    let sortOption = { createdAt: -1 };
    if (sort === 'price-asc') sortOption = { price: 1 };
    if (sort === 'price-desc') sortOption = { price: -1 };
    if (sort === 'popular') sortOption = { totalDeployments: -1, createdAt: -1 };
    if (sort === 'name') sortOption = { name: 1 };

    const bots = await Bot.find(filter).sort(sortOption).lean();

    // Pata categories zilizopo (distinct)
    const categories = await Bot.distinct('category', { status: 'active' });

    res.render('bots', {
      title: 'Deploy Bots - DVARY HOSTING',
      bots,
      categories: categories.filter(Boolean),
      filters: {
        category: category || 'all',
        search: search || '',
        sort: sort || 'newest',
      },
      user: req.user,
    });
  } catch (err) {
    logger.error(`getBots error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea kupakia bots.');
    res.redirect('/dashboard');
  }
};

// ============================
// GET BOT DETAILS
// ============================
exports.getBotDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const bot = await Bot.findById(id).lean();
    if (!bot) {
      return res.status(404).render('404', {
        title: '404 - Bot Haipo',
        message: 'Bot uliyotafuta haipatikani.',
      });
    }

    if (bot.status !== 'active') {
      req.flash('warning', 'Bot haipatikani kwa sasa.');
      return res.redirect('/bots');
    }

    // Deployments za user kwa bot hii
    const myDeployments = await Deployment.find({
      user: req.user._id,
      bot: bot._id,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Bots zingine za category hii
    const relatedBots = await Bot.find({
      status: 'active',
      category: bot.category,
      _id: { $ne: bot._id },
    })
      .limit(4)
      .lean();

    res.render('bot-details', {
      title: `${bot.name} - DVARY HOSTING`,
      bot,
      myDeployments,
      relatedBots,
      user: req.user,
    });
  } catch (err) {
    logger.error(`getBotDetails error: ${err.message}`);
    req.flash('error', 'Hitilafu imetokea.');
    res.redirect('/bots');
  }
};
