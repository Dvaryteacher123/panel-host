/**
 * DVARY HOSTING
 * FILE: services/pterodactylService.js
 * Service ya kufanya operations zote za Pterodactyl Application API
 * API key inatumika BACKEND pekee - haitoki frontend kamwe
 */

'use strict';

const pterodactyl = require('../config/pterodactyl');
const logger = require('../utils/logger');
const { generatePassword, generateUsername } = require('../utils/generatePassword');

// ============================
// USERS
// ============================

/**
 * Pata user kwa email (search) - Pterodactyl filter format
 * @returns {Object|null} user attributes au null kama haipo
 */
async function findUserByEmail(email) {
  try {
    const response = await pterodactyl.get('/users', {
      params: {
        'filter[email]': email,
      },
    });

    const users = response.data.data || [];
    if (users.length === 0) {
      logger.info(`Pterodactyl: user mwenye email ${email} haipo.`);
      return null;
    }

    logger.info(`Pterodactyl: user mwenye email ${email} amepatikana (ID=${users[0].attributes.id}).`);
    return users[0].attributes;
  } catch (err) {
    // Kama filter haifanyi kazi, chukua users wote na tafuta manually
    logger.warn(`findUserByEmail filter method imefail: ${err.message}. Tunajaribu njia ya pili...`);
    try {
      const response = await pterodactyl.get('/users', {
        params: { per_page: 100 },
      });
      const users = response.data.data || [];
      const found = users.find(
        (u) => u.attributes.email.toLowerCase() === email.toLowerCase()
      );
      if (found) {
        logger.info(`Pterodactyl: user ${email} amepatikana kwa manual search (ID=${found.attributes.id}).`);
        return found.attributes;
      }
      return null;
    } catch (err2) {
      logger.error(`findUserByEmail (manual) error: ${err2.message}`);
      return null;
    }
  }
}

/**
 * Pata user kwa ID
 */
async function getUser(userId) {
  const response = await pterodactyl.get(`/users/${userId}`);
  return response.data.attributes;
}

/**
 * Unda user mpya kwenye Pterodactyl
 * @param {Object} data - { email, username, firstName, lastName, password? }
 * @returns {Object} { id, username, email, password }
 */
async function createUser(data) {
  const { email, firstName = 'DVARY', lastName = 'User' } = data;

  if (!email) {
    const err = new Error('Email inahitajika kuunda Pterodactyl user.');
    err.status = 400;
    throw err;
  }

  const username = data.username || generateUsername(email.split('@')[0]);
  const password = data.password || generatePassword(16);

  const payload = {
    email,
    username,
    first_name: firstName,
    last_name: lastName,
    password,
  };

  const response = await pterodactyl.post('/users', payload);
  const attrs = response.data.attributes;

  logger.info(`Pterodactyl user imeundwa: id=${attrs.id}, username=${username}, email=${email}`);

  return {
    id: attrs.id,
    username: attrs.username,
    email: attrs.email,
    password,
  };
}

/**
 * Unda user au chukua existing - hatua moja
 * @returns {Object} { id, username, email, password?, created }
 */
async function ensureUser({ email, username, firstName, lastName }) {
  // 1. Tafuta kwa email
  let existing = await findUserByEmail(email);

  if (existing) {
    return {
      id: existing.id,
      username: existing.username,
      email: existing.email,
      created: false,
    };
  }

  // 2. Unda mpya
  const created = await createUser({
    email,
    username,
    firstName,
    lastName,
  });

  return {
    id: created.id,
    username: created.username,
    email: created.email,
    password: created.password,
    created: true,
  };
}

/**
 * Update user
 */
async function updateUser(userId, data) {
  const response = await pterodactyl.patch(`/users/${userId}`, data);
  return response.data.attributes;
}

/**
 * Delete user
 */
async function deleteUser(userId) {
  await pterodactyl.delete(`/users/${userId}`);
  logger.info(`Pterodactyl user imefutwa: id=${userId}`);
  return true;
}

// ============================
// SERVERS
// ============================

/**
 * Unda server kwenye Pterodactyl
 * @param {Object} config - config yote inatoka kwa admin (Bot/HostingPlan)
 */
async function createServer(config) {
  const {
    name,
    userId,            // Pterodactyl user ID (owner)
    description = null,
    ram,
    cpu,
    disk,
    nodeId,
    nestId,
    eggId,
    dockerImage,
    startupCommand,
    environmentVariables = {},
    allocationId = null,
  } = config;

  // Validation
  const missing = [];
  if (!name) missing.push('name');
  if (!userId) missing.push('userId');
  if (ram === undefined || ram === null) missing.push('ram');
  if (cpu === undefined || cpu === null) missing.push('cpu');
  if (disk === undefined || disk === null) missing.push('disk');
  if (!nodeId) missing.push('nodeId');
  if (!nestId) missing.push('nestId');
  if (!eggId) missing.push('eggId');
  if (!dockerImage) missing.push('dockerImage');
  if (!startupCommand) missing.push('startupCommand');

  if (missing.length > 0) {
    const err = new Error(`MISSING: ${missing.join(', ')} — hazipo kwenye config ya admin.`);
    err.status = 400;
    throw err;
  }

  // Environment variables - Pterodactyl inahitaji string values
  const env = {};
  Object.keys(environmentVariables).forEach((key) => {
    env[key] = String(environmentVariables[key]);
  });

  const payload = {
    name,
    user: Number(userId), // Hakikisha ni namba
    description: description || null,
    egg: Number(eggId),
    docker_image: dockerImage,
    startup: startupCommand,
    environment: env,
    limits: {
      memory: Number(ram),
      swap: 0,
      disk: Number(disk),
      io: 500,
      cpu: Number(cpu),
    },
    feature_limits: {
      databases: 0,
      allocations: 1,
      backups: 0,
    },
    deploy: {
      locations: [Number(nodeId)],
      dedicated_ip: false,
      port_range: [],
    },
    start_on_completion: false,
    skip_scripts: false,
    oom_disabled: false,
  };

  if (allocationId) {
    payload.allocation = {
      default: Number(allocationId),
    };
  }

  logger.info(`Pterodactyl createServer payload: user=${userId}, egg=${eggId}, node=${nodeId}`);

  const response = await pterodactyl.post('/servers', payload);
  const attrs = response.data.attributes;

  logger.info(`Pterodactyl server imeundwa: id=${attrs.id}, identifier=${attrs.identifier}`);

  return {
    id: attrs.id,
    identifier: attrs.identifier,
    uuid: attrs.uuid,
    name: attrs.name,
    status: attrs.status,
  };
}

/**
 * Pata server kwa ID
 */
async function getServer(serverId) {
  const response = await pterodactyl.get(`/servers/${serverId}`);
  return response.data.attributes;
}

async function getServerByExternalId(externalId) {
  const response = await pterodactyl.get(`/servers/external/${externalId}`);
  return response.data.attributes;
}

async function updateServer(serverId, data) {
  const response = await pterodactyl.patch(`/servers/${serverId}/details`, data);
  return response.data.attributes;
}

async function updateServerBuild(serverId, data) {
  const response = await pterodactyl.patch(`/servers/${serverId}/build`, data);
  return response.data.attributes;
}

async function updateServerStartup(serverId, data) {
  const response = await pterodactyl.patch(`/servers/${serverId}/startup`, data);
  return response.data.attributes;
}

// ============================
// SERVER ACTIONS
// ============================

async function suspendServer(serverId) {
  await pterodactyl.post(`/servers/${serverId}/suspend`);
  logger.info(`Pterodactyl server imesimamishwa: id=${serverId}`);
  return true;
}

async function unsuspendServer(serverId) {
  await pterodactyl.post(`/servers/${serverId}/unsuspend`);
  logger.info(`Pterodactyl server imeanzishwa tena: id=${serverId}`);
  return true;
}

async function reinstallServer(serverId) {
  await pterodactyl.post(`/servers/${serverId}/reinstall`);
  logger.info(`Pterodactyl server inareinstall: id=${serverId}`);
  return true;
}

async function deleteServer(serverId) {
  await pterodactyl.delete(`/servers/${serverId}`);
  logger.info(`Pterodactyl server imefutwa: id=${serverId}`);
  return true;
}

// ============================
// UTILITIES
// ============================

async function getNodes() {
  const response = await pterodactyl.get('/nodes');
  return (response.data.data || []).map((n) => n.attributes);
}

async function getNests() {
  const response = await pterodactyl.get('/nests');
  return (response.data.data || []).map((n) => n.attributes);
}

async function getEggsByNest(nestId) {
  const response = await pterodactyl.get(`/nests/${nestId}/eggs`);
  return (response.data.data || []).map((e) => e.attributes);
}

async function getAllocationsByNode(nodeId) {
  const response = await pterodactyl.get(`/nodes/${nodeId}/allocations`);
  return (response.data.data || []).map((a) => a.attributes);
}

async function healthCheck() {
  try {
    await pterodactyl.get('/nodes');
    return true;
  } catch (err) {
    logger.error(`Pterodactyl health check imefail: ${err.message}`);
    return false;
  }
}

// ============================
// EXPORTS
// ============================
module.exports = {
  // Users
  createUser,
  getUser,
  findUserByEmail,
  ensureUser,
  updateUser,
  deleteUser,

  // Servers
  createServer,
  getServer,
  getServerByExternalId,
  updateServer,
  updateServerBuild,
  updateServerStartup,

  // Actions
  suspendServer,
  unsuspendServer,
  reinstallServer,
  deleteServer,

  // Utilities
  getNodes,
  getNests,
  getEggsByNest,
  getAllocationsByNode,
  healthCheck,
};
