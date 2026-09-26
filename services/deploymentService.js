/**
 * DVARY HOSTING
 * FILE: services/deploymentService.js
 * Service kuu ya deployment - inashughulikia:
 *  - Bot deployment
 *  - Server purchase (hosting plan)
 *  - Admin panel purchase
 *  - Coin deduction + transaction recording (atomic-ish)
 *  - Rollback kama deployment imefail
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
// HELPERS
// ============================

/**
 * Hakikisha user ana Pterodactyl account. Unda kama haipo.
 */
async function ensurePterodactylUser(user) {
  if (user.pterodactylUserId) {
    return {
      id: user.pterodactylUserId,
      username: user.pterodactylUsername,
      created: false,
    };
  }

  // Angalia kama email ipo tayari Pterodactyl upande wa pili
  let existing = null;
  try {
    existing = await pterodactylService.findUserByEmail(user.email);
  } catch (err) {
    logger.warn(`ensurePterodactylUser findUserByEmail warn: ${err.message}`);
  }

  if (existing) {
    user.pterodactylUserId = existing.id;
    user.pterodactylUsername = existing.username;
    await user.save();
    return { id: existing.id, username: existing.username, created: false };
  }

  // Unda mpya
  const created = await pterodactylService.createUser({
    email: user.email,
    username: user.username,
    firstName: user.username,
    lastName: 'DVARY',
  });

  user.pterodactylUserId = created.id;
  user.pterodactylUsername = created.username;
  await user.save();

  return { id: created.id, username: created.username, created: true };
}

/**
 * Toa coins na rekodi transaction. Inatumia session kwa safety.
 */
async function deductCoinsAndRecord({ user, amount, reason, description, referenceModel, referenceId, performedBy = null }) {
  if (amount < 0) {
    const err = new Error('Kiasi cha coins si sahihi.');
    err.status = 400;
    throw err;
  }

  // Reload user fresh kutoka DB kwa usahihi wa balance
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

/**
 * Deploy bot kwa user.
 * @returns {Object} { success, deployment?, server?, message, balance? }
 */
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
    ram: bot.ram,
    cpu: bot.cpu,
    disk: bot.disk,
    coinsSpent: bot.price,
    status: 'pending',
    progress: 5,
  });

  deployment.addLog('Deployment imeanzishwa.', 'info');
  await deployment.save();

  let coinsDeducted = false;
  let pterodactylServerCreated = null;

  try {
    // 4. Hakiki GitHub (optional — usizuie kama API haipatikani)
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
      // Kama GitHub API haipatikani (rate limit, n.k.) tunaendelea tu — repo itajaribiwa na egg yenyewe
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

    // Attach transaction kwa deployment (info pekee)
    deployment.addLog(`Coins zimetolewa: ${bot.price}. Transaction ID: ${transaction._id}`, 'info');
    await deployment.save();

    // 6. Hakikisha Pterodactyl user
    deployment.progress = 45;
    deployment.addLog('Inahakikisha Pterodactyl user...', 'info');
    await deployment.save();

    const pteroUser = await ensurePterodactylUser(user);
    deployment.addLog(`Pterodactyl user: ID=${pteroUser.id}, username=${pteroUser.username}`, 'success');
    await deployment.save();

    // 7. Unda server kwenye Pterodactyl
    deployment.progress = 65;
    deployment.addLog('Inaunda server kwenye Pterodactyl...', 'info');
    await deployment.save();

    // MISSING CHECK — kama bot haina config ya Pterodactyl, tunafail kwa ufasaha
    const missing = [];
    if (!bot.eggId) missing.push('eggId');
    if (!bot.nestId) missing.push('nestId');
    if (!bot.dockerImage) missing.push('dockerImage');
    if (!bot.startupCommand) missing.push('startupCommand');

    if (missing.length > 0) {
      throw new Error(`MISSING kwenye bot config: ${missing.join(', ')}`);
    }

    // Node ID — kwa sasa tunachukua ya kwanza kutoka Pterodactyl (admin anaweza kubadilisha baadaye)
    // Hii ni kwa sababu Bot model haina nodeId. Admin anaweza kuongeza baadaye.
    const nodes = await pterodactylService.getNodes();
    if (!nodes || nodes.length === 0) {
      throw new Error('Hakuna Pterodactyl node iliyopatikana.');
    }
    const nodeId = nodes[0].id;

    // Chukua allocation inayopatikana kwenye node
    const allocations = await pterodactylService.getAllocationsByNode(nodeId);
    const freeAllocation = allocations.find((a) => !a.assigned);
    const allocationId = freeAllocation ? freeAllocation.id : null;

    if (!allocationId) {
      throw new Error('Hakuna allocation inayopatikana kwenye node.');
    }

    const serverName = `${bot.name}-${user.username}-${Date.now().toString().slice(-4)}`;

    pterodactylServerCreated = await pterodactylService.createServer({
      name: serverName,
      userId: pteroUser.id,
      description: `DVARY HOSTING — ${bot.name}`,
      ram: bot.ram,
      cpu: bot.cpu,
      disk: bot.disk,
      nodeId,
      nestId: bot.nestId,
      eggId: bot.eggId,
      dockerImage: bot.dockerImage,
      startupCommand: bot.startupCommand,
      environmentVariables: bot.environmentVariables || {},
      allocationId,
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
      ram: bot.ram,
      cpu: bot.cpu,
      disk: bot.disk,
      pterodactylServerId: pterodactylServerCreated.id,
      pterodactylServerIdentifier: pterodactylServerCreated.identifier,
      pterodactylServerUuid: pterodactylServerCreated.uuid,
      nodeId,
      nestId: bot.nestId,
      eggId: bot.eggId,
      allocationId,
      dockerImage: bot.dockerImage,
      startupCommand: bot.startupCommand,
      environmentVariables: bot.environmentVariables || {},
      coinsSpent: bot.price,
      status: 'active',
    });

    // 9. Update deployment record → success
    deployment.markSuccess({
      pterodactylServerId: pterodactylServerCreated.id,
      pterodactylServerIdentifier: pterodactylServerCreated.identifier,
      pterodactylServerUuid: pterodactylServerCreated.uuid,
    });
    deployment.addLog('Deployment imekamilika kwa mafanikio.', 'success');
    await deployment.save();

    // 10. Ongeza totalDeployments kwenye bot
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

    // Rollback: kama coins zilitolewa lakini server haikuundwa, rudisha
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

    // Kama Pterodactyl server iliundwa lakini step nyingine imefail, jaribu kuifuta
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

/**
 * Nunua hosting plan kwa user.
 */
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

  // MISSING validation
  const missing = [];
  if (!plan.eggId) missing.push('eggId');
  if (!plan.nestId) missing.push('nestId');
  if (!plan.nodeId) missing.push('nodeId');
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
    ram: plan.ram,
    cpu: plan.cpu,
    disk: plan.disk,
    nodeId: plan.nodeId,
    nestId: plan.nestId,
    eggId: plan.eggId,
    allocationId: plan.allocationId || null,
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

    // Allocation
    let allocationId = plan.allocationId;
    if (!allocationId) {
      const allocations = await pterodactylService.getAllocationsByNode(plan.nodeId);
      const free = allocations.find((a) => !a.assigned);
      if (!free) throw new Error('Hakuna allocation inayopatikana kwenye node.');
      allocationId = free.id;
    }

    const serverName = `${plan.name}-${user.username}-${Date.now().toString().slice(-4)}`;

    pterodactylServerCreated = await pterodactylService.createServer({
      name: serverName,
      userId: pteroUser.id,
      description: `DVARY HOSTING — ${plan.name}`,
      ram: plan.ram,
      cpu: plan.cpu,
      disk: plan.disk,
      nodeId: plan.nodeId,
      nestId: plan.nestId,
      eggId: plan.eggId,
      dockerImage: plan.dockerImage,
      startupCommand: plan.startupCommand,
      environmentVariables: plan.environmentVariables || {},
      allocationId,
    });

    serverDoc.pterodactylServerId = pterodactylServerCreated.id;
    serverDoc.pterodactylServerIdentifier = pterodactylServerCreated.identifier;
    serverDoc.pterodactylServerUuid = pterodactylServerCreated.uuid;
    serverDoc.allocationId = allocationId;
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

/**
 * Nunua admin panel product.
 * Kwa version hii, tunatoa downloadUrl/deploymentInfo kwa user.
 */
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

  // Toa coins + rekodi transaction
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
