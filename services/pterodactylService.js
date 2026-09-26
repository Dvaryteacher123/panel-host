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
 * Unda user kwenye Pterodactyl
 * @param {Object} data - { email, username, firstName, lastName, password? }
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
  logger.info(`Pterodactyl user imeundwa: id=${response.data.attributes.id}, username=${username}`);

  return {
    id: response.data.attributes.id,
    username: response.data.attributes.username,
    email: response.data.attributes.email,
    password, // hii ni ya kwanza pekee - backend inaweza kui-display kwa admin
  };
}

/**
 * Pata user kwa ID
 */
async function getUser(userId) {
  const response = await pterodactyl.get(`/users/${userId}`);
  return response.data.attributes;
}

/**
 * Pata user kwa email (search)
 */
async function findUserByEmail(email) {
  const response = await pterodactyl.get('/users', {
    params: { filter: { email } },
  });

  const users = response.data.data || [];
  if (users.length === 0) return null;
  return users[0].attributes;
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

  // ============================
  // VALIDATION
  // ============================
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

  // Build payload
  const payload = {
    name,
    user: userId,
    description: description || null,
    egg: eggId,
    docker_image: dockerImage,
    startup: startupCommand,
    environment: env,
    limits: {
      memory: ram,
      swap: 0,
      disk,
      io: 500,
      cpu,
    },
    feature_limits: {
      databases: 0,
      allocations: 1,
      backups: 0,
    },
    deploy: {
      locations: [nodeId],
      dedicated_ip: false,
      port_range: [],
    },
    start_on_completion: false,
    skip_scripts: false,
    oom_disabled: false,
  };

  // Kama allocation ID imetolewa, weka kwenye deploy
  if (allocationId) {
    payload.allocation = {
      default: allocationId,
    };
  }

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

/**
 * Pata server kwa external ID
 */
async function getServerByExternalId(externalId) {
  const response = await pterodactyl.get(`/servers/external/${externalId}`);
  return response.data.attributes;
}

/**
 * Update server details (resources, name, n.k.)
 */
async function updateServer(serverId, data) {
  const response = await pterodactyl.patch(`/servers/${serverId}/details`, data);
  return response.data.attributes;
}

/**
 * Update build (resources)
 */
async function updateServerBuild(serverId, data) {
  const response = await pterodactyl.patch(`/servers/${serverId}/build`, data);
  return response.data.attributes;
}

/**
 * Update startup
 */
async function updateServerStartup(serverId, data) {
  const response = await pterodactyl.patch(`/servers/${serverId}/startup`, data);
  return response.data.attributes;
}

// ============================
// SERVER ACTIONS
// ============================

/**
 * Suspend server
 */
async function suspendServer(serverId) {
  await pterodactyl.post(`/servers/${serverId}/suspend`);
  logger.info(`Pterodactyl server imesimamishwa: id=${serverId}`);
  return true;
}

/**
 * Unsuspend server
 */
async function unsuspendServer(serverId) {
  await pterodactyl.post(`/servers/${serverId}/unsuspend`);
  logger.info(`Pterodactyl server imeanzishwa tena: id=${serverId}`);
  return true;
}

/**
 * Reinstall server
 */
async function reinstallServer(serverId) {
  await pterodactyl.post(`/servers/${serverId}/reinstall`);
  logger.info(`Pterodactyl server inareinstall: id=${serverId}`);
  return true;
}

/**
 * Delete server
 */
async function deleteServer(serverId) {
  await pterodactyl.delete(`/servers/${serverId}`);
  logger.info(`Pterodactyl server imefutwa: id=${serverId}`);
  return true;
}

// ============================
// UTILITIES
// ============================

/**
 * Pata nodes zote zilizopo
 */
async function getNodes() {
  const response = await pterodactyl.get('/nodes');
  return (response.data.data || []).map((n) => n.attributes);
}

/**
 * Pata nests zote
 */
async function getNests() {
  const response = await pterodactyl.get('/nests');
  return (response.data.data || []).map((n) => n.attributes);
}

/**
 * Pata eggs kwa nest
 */
async function getEggsByNest(nestId) {
  const response = await pterodactyl.get(`/nests/${nestId}/eggs`);
  return (response.data.data || []).map((e) => e.attributes);
}

/**
 * Pata allocations kwa node
 */
async function getAllocationsByNode(nodeId) {
  const response = await pterodactyl.get(`/nodes/${nodeId}/allocations`);
  return (response.data.data || []).map((a) => a.attributes);
}

/**
 * Health check - angalia kama API inafanya kazi
 */
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
