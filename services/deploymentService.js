/**
 * DVARY HOSTING
 * FILE: services/deploymentService.js
 *
 * Service kuu ya deployment - inashughulikia:
 *  - Bot deployment
 *  - Server purchase (hosting plan)
 *  - Admin panel purchase
 *  - Coin deduction + transaction recording
 *  - Rollback kama deployment imefail
 *
 * MUHIMU:
 *   - Node ID (1), Allocation ID (1), RAM (512), CPU (100), Disk (1024)
 *     zote ni HARDCODED kwenye `pterodactylService.js`.
 *   - `createServer()` HAITUMIWI kwa `nodeId` au `allocationId`.
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

const pterodactylService = require('./pterodactylService');
const githubService = require('./githubService');
const logger = require('../utils/logger');

// ============================
// HARDCODED VALUES (kwa MongoDB record pekee)
// ============================
const NODE_ID = 1;
const ALLOCATION_ID = 1;
const RAM = 512;
const CPU = 100;
const DISK = 1024;

// ============================
// HELPERS
// ============================

/**
 * Hakikisha user ana Pterodactyl account.
 * Tafuta kwa email → kama haipo unda → hifadhi ID kwenye MongoDB.
 */
async function ensurePterodactylUser(user) {
  // 1. Kama tuna ID tayari, thibitisha ipo Pterodactyl
  if (user.pterodactylUserId) {
    try {
      const existing = await pterodactylService.getUser(user.pterodactylUserId);
      if (existing && existing.id) {
        logger.info(`ensurePterodactylUser: user ID ${existing.id} amethibitishwa.`);
        return {
          id: existing.id,
          username: existing.username,
          created: false,
        };
      }
    } catch (err) {
      logger.warn(
        `ensurePterodactylUser: ID ya zamani (${user.pterodactylUserId}) haifanyi kazi: ${err.message}. Tutafute tena kwa email.`
      );
      user.pterodactylUserId = null;
      user.pterodactylUsername = null;
      await user.save();
    }
  }

  // 2. Tafuta kwa email au unda mpya
  const result = await pterodactylService.ensureUser({
    email: user.email,
    username: user.username,
    firstName: user.username,
    lastName: 'DVARY',
  });

  // 3. Hifadhi ID na username kwenye MongoDB
  user.pterodactylUserId = result.id;
  user.pterodactylUsername = result.username;
  await user.save();

  logger.info(
    `ensurePterodactylUser: user ${user.username} → Pterodactyl ID ${result.id} (${
      result.created ? 'imeundwa mpya' : 'existing'
    }).`
  );

  return {
    id: result.id,
    username: result.username,
    password: result.password,
    created: result.created,
  };
}

/**
 * Toa coins na rekodi transaction.
 */
async function deductCoinsAndRecord({
  user,
  amount,
  reason,
  description,
  referenceModel,
  referenceId,
  performedBy = null,
}) {
  if (amount < 0) {
    const err = new Error('Kiasi cha coins si sahihi.');
    err.status = 400;
    throw err;
  }

  const freshUser = await User.findById(user._id);
  if (!freshUser) {
    const err = new Error('User haipatikani.');
    err.status = 404;
    throw err;
  }

  if (freshUser.coins < amount) {
    const err = new Error(`Coins hazitoshi. Unazo ${freshUser.coins}, unahitaji ${amount}.`);
    err.status = 400;
    throw err;
  }

  const balanceBefore = freshUser.coins;
  const balanceAfter = balanceBefore - amount;

  freshUser.coins = balanceAfter;
  await freshUser.save();

  const transaction = await Transaction.create({
    user: freshUser._id,
    type: 'debit',
    reason,
    amount,
    balanceBefore,
    balanceAfter,
    description: description || null,
    referenceModel: referenceModel || null,
    referenceId: referenceId || null,
    performedBy,
    status: 'completed',
  });

  return { transaction, balanceBefore, balanceAfter, user: freshUser };
}

/**
 * Rudisha coins kama deployment imefail (rollback).
 */
async function refundCoins({ user, amount, reason, description, referenceModel, referenceId }) {
  const freshUser = await User.findById(user._id);
  if (!freshUser) return null;

  const balanceBefore = freshUser.coins;
  const balanceAfter = balanceBefore + amount;

  freshUser.coins = balanceAfter;
  await freshUser.save();

  const transaction = await Transaction.create({
    user: freshUser._id,
    type: 'credit',
    reason: reason || 'refund',
    amount,
    balanceBefore,
    balanceAfter,
    description: description || 'Refund ya deployment iliyofail',
    referenceModel: referenceModel || null,
    referenceId: referenceId || null,
    status: 'completed',
  });

  logger.info(`Refund imefanyika: user=${freshUser._id}, amount=${amount}, balance=${balanceAfter}`);
  return { transaction, user: freshUser };
}

// ============================
// DEPLOY BOT
// ============================
async function deployBot(user, botId) {
  // 1. Pata bot
  const bot = await Bot.findById(botId);
  if (!bot) {
    const err = new Error('Bot haipo.');
    err.status = 404;
    throw err;
  }

  if (bot.status !== 'active') {
    const err = new Error('Bot haipatikani kwa sasa.');
    err.status = 400;
    throw err;
  }

  // 2. Angalia coins
  if (user.coins < bot.price) {
    const err = new Error(`Coins hazitoshi. Unazo ${user.coins}, unahitaji ${bot.price}.`);
    err.status = 400;
    throw err;
  }

  // 3. Unda deployment record (pending) kwanza
  const deployment = await Deployment.create({
    user: user._id,
    bot: bot._id,
    botName: bot.name,
    botImage: bot.image,
    githubUrl: bot.githubUrl,
    githubBranch: bot.githubBranch || 'main',
    ram: RAM,
    cpu: CPU,
    disk: DISK,
    coinsSpent: bot.price,
    status: 'pending',
    progress: 5,
  });

  deployment.addLog('Deployment imeanzishwa.', 'info');
  await deployment.save();

  let coinsDeducted = false;
  let pterodactylServerCreated = null;

  try {
    // 4. Hakiki GitHub (optional)
    try {
      deployment.progress = 15;
      deployment.addLog('Inahakiki GitHub repository...', 'info');
      await deployment.save();

      const githubCheck = await githubService.validateForDeployment(
        bot.githubUrl,
        bot.githubBranch || 'main'
      );

      if (!githubCheck.valid) {
        throw new Error(`GitHub: ${githubCheck.reason}`);
      }
      deployment.addLog('GitHub repository imehakikiwa.', 'success');
    } catch (ghErr) {
      deployment.addLog(`GitHub check: ${ghErr.message} (tunaendelea)`, 'warn');
    }

    // 5. Toa coins + rekodi transaction
    deployment.progress = 30;
    deployment.addLog('Inatoa coins...', 'info');
    await deployment.save();

    const { transaction } = await deductCoinsAndRecord({
      user,
      amount: bot.price,
      reason: 'bot-deployment',
      description: `Deployment ya bot: ${bot.name}`,
      referenceModel: 'Deployment',
      referenceId: deployment._id,
    });
    coinsDeducted = true;

    deployment.addLog(`Coins zimetolewa: ${bot.price}. Transaction: ${transaction._id}`, 'info');
    await deployment.save();

    // 6. HAKIKISHA PTERODACTYL USER
    deployment.progress = 45;
    deployment.addLog('Inahakikisha Pterodactyl user (tafuta kwa email)...', 'info');
    await deployment.save();

    const pteroUser = await ensurePterodactylUser(user);

    deployment.addLog(
      `Pterodactyl user: ID=${pteroUser.id}, username=${pteroUser.username} (${
        pteroUser.created ? 'mpya' : 'existing'
      })`,
      'success'
    );
    await deployment.save();

    if (!pteroUser.id || isNaN(pteroUser.id)) {
      throw new Error('Pterodactyl user ID haipatikani baada ya kuunda/tafuta.');
    }

    // 7. Unda server kwenye Pterodactyl (HARDCODED)
    deployment.progress = 65;
    deployment.addLog(
      `Node: ${NODE_ID}, Allocation: ${ALLOCATION_ID} (hardcoded), RAM: ${RAM}MB, CPU: ${CPU}%, Disk: ${DISK}MB`,
      'info'
    );
    await deployment.save();

    // MISSING CHECK — Bot config
    const missing = [];
    if (!bot.eggId) missing.push('eggId');
    if (!bot.nestId) missing.push('nestId');
    if (!bot.dockerImage) missing.push('dockerImage');
    if (!bot.startupCommand) missing.push('startupCommand');

    if (missing.length > 0) {
      throw new Error(`MISSING kwenye bot config: ${missing.join(', ')}`);
    }

    const serverName = `${bot.name}-${user.username}-${Date.now().toString().slice(-4)}`;

    deployment.addLog('Inaunda server kwenye Pterodactyl...', 'info');
    await deployment.save();

    pterodactylServerCreated = await pterodactylService.createServer({
      name: serverName,
      userId: pteroUser.id,
      description: `DVARY HOSTING — ${bot.name}`,
      nestId: bot.nestId,
      eggId: bot.eggId,
      dockerImage: bot.dockerImage,
      startupCommand: bot.startupCommand,
      environmentVariables: bot.environmentVariables || {},
      // nodeId / allocationId / ram / cpu / disk hazitumwi
      // → zote zipo HARDCODED kwenye pterodactylService
    });

    deployment.addLog(
      `Pterodactyl server imeundwa: ID=${pterodactylServerCreated.id}, identifier=${pterodactylServerCreated.identifier}`,
      'success'
    );
    await deployment.save();

    // 8. Hifadhi Server kwenye MongoDB
    deployment.progress = 85;
    deployment.addLog('Inahifadhi server kwenye database...', 'info');
    await deployment.save();

    const serverDoc = await Server.create({
      user: user._id,
      source: 'bot',
      bot: bot._id,
      name: bot.name,
      description: `Bot deployment: ${bot.name}`,
      ram: RAM,
      cpu: CPU,
      disk: DISK,
      pterodactylServerId: pterodactylServerCreated.id,
      pterodactylServerIdentifier: pterodactylServerCreated.identifier,
      pterodactylServerUuid: pterodactylServerCreated.uuid,
      nodeId: NODE_ID,
      nestId: bot.nestId,
      eggId: bot.eggId,
      allocationId: ALLOCATION_ID,
      dockerImage: bot.dockerImage,
      startupCommand: bot.startupCommand,
      environmentVariables: bot.environmentVariables || {},
      coinsSpent: bot.price,
      status: 'active',
    });

    // 9. Update deployment → success
    deployment.markSuccess({
      pterodactylServerId: pterodactylServerCreated.id,
      pterodactylServerIdentifier: pterodactylServerCreated.identifier,
      pterodactylServerUuid: pterodactylServerCreated.uuid,
    });
    deployment.addLog('Deployment imekamilika kwa mafanikio.', 'success');
    await deployment.save();

    // 10. Increment bot deploy count
    try {
      await bot.incrementDeployments();
    } catch (e) {
      logger.warn(`incrementDeployments warn: ${e.message}`);
    }

    logger.info(`Bot deployment imefanikiwa: user=${user._id}, bot=${bot._id}, server=${serverDoc._id}`);

    return {
      success: true,
      deployment,
      server: serverDoc,
      message: `Deployment ya "${bot.name}" imefanikiwa.`,
    };
  } catch (err) {
    logger.error(`deployBot error: ${err.message}`);

    // Rollback: rudisha coins
    if (coinsDeducted) {
      try {
        await refundCoins({
          user,
          amount: bot.price,
          reason: 'refund',
          description: `Refund kwa sababu deployment imefail: ${err.message}`,
          referenceModel: 'Deployment',
          referenceId: deployment._id,
        });
        deployment.addLog(`Coins zimerudishwa (refund): ${bot.price}`, 'warn');
      } catch (refundErr) {
        logger.error(`Refund imefail kwa deployment ${deployment._id}: ${refundErr.message}`);
      }
    }

    // Futa Pterodactyl server kama iliundwa
    if (pterodactylServerCreated && pterodactylServerCreated.id) {
      try {
        await pterodactylService.deleteServer(pterodactylServerCreated.id);
        deployment.addLog('Pterodactyl server ilifutwa (rollback).', 'warn');
      } catch (delErr) {
        logger.error(`deleteServer rollback warn: ${delErr.message}`);
      }
    }

    deployment.markFailed(err.message);
    deployment.addLog(`Imefail: ${err.message}`, 'error');
    await deployment.save();

    const wrapped = new Error(err.message || 'Deployment imefail.');
    wrapped.status = err.status || 500;
    wrapped.deployment = deployment;
    throw wrapped;
  }
}

// ============================
// BUY HOSTING PLAN
// ============================
async function buyHostingPlan(user, planId) {
  const plan = await HostingPlan.findById(planId);
  if (!plan) {
    const err = new Error('Hosting plan haipo.');
    err.status = 404;
    throw err;
  }

  if (plan.status !== 'active') {
    const err = new Error('Plan haipatikani kwa sasa.');
    err.status = 400;
    throw err;
  }

  if (plan.stock !== null && plan.stock <= 0) {
    const err = new Error('Plan imeisha stock.');
    err.status = 400;
    throw err;
  }

  if (user.coins < plan.price) {
    const err = new Error(`Coins hazitoshi. Unazo ${user.coins}, unahitaji ${plan.price}.`);
    err.status = 400;
    throw err;
  }

  const missing = [];
  if (!plan.eggId) missing.push('eggId');
  if (!plan.nestId) missing.push('nestId');
  if (!plan.dockerImage) missing.push('dockerImage');
  if (!plan.startupCommand) missing.push('startupCommand');

  if (missing.length > 0) {
    const err = new Error(`MISSING kwenye plan config: ${missing.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const serverDoc = await Server.create({
    user: user._id,
    source: 'hosting-plan',
    hostingPlan: plan._id,
    name: plan.name,
    description: plan.description,
    ram: RAM,
    cpu: CPU,
    disk: DISK,
    nestId: plan.nestId,
    eggId: plan.eggId,
    dockerImage: plan.dockerImage,
    startupCommand: plan.startupCommand,
    environmentVariables: plan.environmentVariables || {},
    coinsSpent: plan.price,
    status: 'creating',
  });

  let coinsDeducted = false;
  let pterodactylServerCreated = null;

  try {
    // Toa coins
    await deductCoinsAndRecord({
      user,
      amount: plan.price,
      reason: 'server-purchase',
      description: `Kununua plan: ${plan.name}`,
      referenceModel: 'Server',
      referenceId: serverDoc._id,
    });
    coinsDeducted = true;

    // Ensure Pterodactyl user
    const pteroUser = await ensurePterodactylUser(user);

    if (!pteroUser.id || isNaN(pteroUser.id)) {
      throw new Error('Pterodactyl user ID haipatikani baada ya kuunda/tafuta.');
    }

    // Unda server (HARDCODED)
    logger.info(
      `buyHostingPlan: node=${NODE_ID}, allocation=${ALLOCATION_ID}, ram=${RAM}, cpu=${CPU}, disk=${DISK}`
    );

    const serverName = `${plan.name}-${user.username}-${Date.now().toString().slice(-4)}`;

    pterodactylServerCreated = await pterodactylService.createServer({
      name: serverName,
      userId: pteroUser.id,
      description: `DVARY HOSTING — ${plan.name}`,
      nestId: plan.nestId,
      eggId: plan.eggId,
      dockerImage: plan.dockerImage,
      startupCommand: plan.startupCommand,
      environmentVariables: plan.environmentVariables || {},
      // nodeId / allocationId / ram / cpu / disk hazitumwi
      // → zote zipo HARDCODED kwenye pterodactylService
    });

    serverDoc.pterodactylServerId = pterodactylServerCreated.id;
    serverDoc.pterodactylServerIdentifier = pterodactylServerCreated.identifier;
    serverDoc.pterodactylServerUuid = pterodactylServerCreated.uuid;
    serverDoc.nodeId = NODE_ID;
    serverDoc.allocationId = ALLOCATION_ID;
    serverDoc.markActive();
    await serverDoc.save();

    try {
      await plan.incrementPurchases();
    } catch (e) {
      logger.warn(`incrementPurchases warn: ${e.message}`);
    }

    logger.info(`Hosting plan imenunuliwa: user=${user._id}, plan=${plan._id}, server=${serverDoc._id}`);

    return {
      success: true,
      server: serverDoc,
      message: `Umefanikiwa kununua "${plan.name}".`,
    };
  } catch (err) {
    logger.error(`buyHostingPlan error: ${err.message}`);

    if (coinsDeducted) {
      try {
        await refundCoins({
          user,
          amount: plan.price,
          reason: 'refund',
          description: `Refund kwa sababu purchase imefail: ${err.message}`,
          referenceModel: 'Server',
          referenceId: serverDoc._id,
        });
      } catch (refundErr) {
        logger.error(`Refund imefail: ${refundErr.message}`);
      }
    }

    if (pterodactylServerCreated && pterodactylServerCreated.id) {
      try {
        await pterodactylService.deleteServer(pterodactylServerCreated.id);
      } catch (delErr) {
        logger.error(`deleteServer rollback warn: ${delErr.message}`);
      }
    }

    serverDoc.markFailed(err.message);
    await serverDoc.save();

    const wrapped = new Error(err.message || 'Purchase imefail.');
    wrapped.status = err.status || 500;
    throw wrapped;
  }
}

// ============================
// BUY ADMIN PANEL
// ============================
async function buyAdminPanel(user, panelId) {
  const panel = await AdminPanel.findById(panelId);
  if (!panel) {
    const err = new Error('Admin panel haipo.');
    err.status = 404;
    throw err;
  }

  if (panel.status !== 'active') {
    const err = new Error('Panel haipatikani kwa sasa.');
    err.status = 400;
    throw err;
  }

  if (panel.stock !== null && panel.stock <= 0) {
    const err = new Error('Panel imeisha stock.');
    err.status = 400;
    throw err;
  }

  if (user.coins < panel.price) {
    const err = new Error(`Coins hazitoshi. Unazo ${user.coins}, unahitaji ${panel.price}.`);
    err.status = 400;
    throw err;
  }

  await deductCoinsAndRecord({
    user,
    amount: panel.price,
    reason: 'admin-panel-purchase',
    description: `Kununua admin panel: ${panel.name}`,
    referenceModel: 'AdminPanel',
    referenceId: panel._id,
  });

  try {
    await panel.incrementPurchases();
  } catch (e) {
    logger.warn(`incrementPurchases warn: ${e.message}`);
  }

  logger.info(`Admin panel imenunuliwa: user=${user._id}, panel=${panel._id}`);

  return {
    success: true,
    panel,
    message: `Umefanikiwa kununua "${panel.name}".`,
  };
}

// ============================
// ADMIN: ADD / REMOVE COINS
// ============================
async function adminAddCoins({ targetUserId, amount, adminId, description }) {
  if (amount <= 0) {
    const err = new Error('Kiasi kiwe zaidi ya 0.');
    err.status = 400;
    throw err;
  }

  const target = await User.findById(targetUserId);
  if (!target) {
    const err = new Error('User haipatikani.');
    err.status = 404;
    throw err;
  }

  const balanceBefore = target.coins;
  const balanceAfter = balanceBefore + amount;
  target.coins = balanceAfter;
  await target.save();

  const transaction = await Transaction.create({
    user: target._id,
    type: 'credit',
    reason: 'admin-add',
    amount,
    balanceBefore,
    balanceAfter,
    description: description || `Admin ameongeza coins`,
    performedBy: adminId,
    status: 'completed',
  });

  return { transaction, user: target };
}

async function adminRemoveCoins({ targetUserId, amount, adminId, description }) {
  if (amount <= 0) {
    const err = new Error('Kiasi kiwe zaidi ya 0.');
    err.status = 400;
    throw err;
  }

  const target = await User.findById(targetUserId);
  if (!target) {
    const err = new Error('User haipatikani.');
    err.status = 404;
    throw err;
  }

  if (target.coins < amount) {
    const err = new Error(`User hana coins za kutosha. Ana ${target.coins}, unajaribu kuondoa ${amount}.`);
    err.status = 400;
    throw err;
  }

  const balanceBefore = target.coins;
  const balanceAfter = balanceBefore - amount;
  target.coins = balanceAfter;
  await target.save();

  const transaction = await Transaction.create({
    user: target._id,
    type: 'debit',
    reason: 'admin-remove',
    amount,
    balanceBefore,
    balanceAfter,
    description: description || `Admin ameondoa coins`,
    performedBy: adminId,
    status: 'completed',
  });

  return { transaction, user: target };
}

// ============================
// EXPORTS
// ============================
module.exports = {
  deployBot,
  buyHostingPlan,
  buyAdminPanel,
  adminAddCoins,
  adminRemoveCoins,
  ensurePterodactylUser,
  deductCoinsAndRecord,
  refundCoins,
};
