/**
 * DVARY HOSTING
 * FILE: services/pterodactylService.js
 *
 * Pterodactyl Application API service.
 *
 * MUHIMU:
 *   - Server inaundwa kwa node ID 1 MOJA KWA MOJA (deploy.locations: [1]).
 *   - Allocation port: [25565] (hardcoded).
 *   - Memory: 512 MB (au kutoka config), Disk: 1024 MB (au kutoka config).
 *   - HAKUNA automatic node searching.
 */

'use strict';

const pterodactyl = require('../config/pterodactyl');
const logger = require('../utils/logger');
const { generatePassword, generateUsername } = require('../utils/generatePassword');

// ============================
// HARDCODED CONFIG
// ============================
const NODE_ID = 1;
const ALLOCATION_PORT = 25565;
const DEFAULT_MEMORY = 512;
const DEFAULT_DISK = 1024;
const DEFAULT_CPU = 100;
const DEFAULT_SWAP = 0;
const DEFAULT_IO = 500;

// ============================
// USERS
// ============================

async function findUserByEmail(email) {
  try {
    const response = await pterodactyl.get('/users', {
      params: { 'filter[email]': email },
    });
    const users = response.data.data || [];
    if (users.length === 0) {
      logger.info(`Pterodactyl: user ${email} haipo.`);
      return null;
    }
    logger.info(`Pterodactyl: user ${email} amepatikana (ID=${users[0].attributes.id}).`);
    return users[0].attributes;
  } catch (err) {
    logger.warn(`findUserByEmail filter imefail: ${err.message}. Jaribio la pili...`);
    try {
      const response = await pterodactyl.get('/users', {
        params: { per_page: 100 },
      });
      const users = response.data.data || [];
      const found = users.find(
        (u) => u.attributes.email.toLowerCase() === email.toLowerCase()
      );
      if (found) {
        logger.info(`Pterodactyl: user ${email} amepatikana (ID=${found.attributes.id}).`);
        return found.attributes;
      }
      return null;
    } catch (err2) {
      logger.error(`findUserByEmail (manual) error: ${err2.message}`);
      return null;
    }
  }
}

async function getUser(userId) {
  const response = await pterodactyl.get(`/users/${userId}`);
  return response.data.attributes;
}

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

  logger.info(`Pterodactyl user imeundwa: id=${attrs.id}, username=${username}`);

  return {
    id: attrs.id,
    username: attrs.username,
    email: attrs.email,
    password,
  };
}

async function ensureUser({ email, username, firstName, lastName }) {
  const existing = await findUserByEmail(email);

  if (existing) {
    return {
      id: existing.id,
      username: existing.username,
      email: existing.email,
      created: false,
    };
  }

  const created = await createUser({ email, username, firstName, lastName });

  return {
    id: created.id,
    username: created.username,
    email: created.email,
    password: created.password,
    created: true,
  };
}

async function updateUser(userId, data) {
  const response = await pterodactyl.patch(`/users/${userId}`, data);
  return response.data.attributes;
}

async function deleteUser(userId) {
  await pterodactyl.delete(`/users/${userId}`);
  logger.info(`Pterodactyl user imefutwa: id=${userId}`);
  return true;
}

// ============================
// SERVERS
// ============================

/**
 * Unda server kwenye Pterodactyl.
 *
 * Payload ni EXPLICIT:
 *   - deploy.locations: [1]       → Node 1 moja kwa moja
 *   - allocation.default: 25565   → port 25565 (port ndiyo inatumika)
 *   - limits.memory: 512
 *   - limits.disk: 1024
 *   - limits.cpu: 100
 *
 * HAKUNA automatic node search.
 */
async function createServer(config) {
  const {
    name,
    userId,
    description = null,
    memory,
    disk,
    cpu,
    nestId,
    eggId,
    dockerImage,
    startupCommand,
    environmentVariables = {},
    allocationPort, // optional override
  } = config;

  // ============================
  // VALIDATION
  // ============================
  const missing = [];
  if (!name) missing.push('name');
  if (!userId) missing.push('userId');
  if (!nestId) missing.push('nestId');
  if (!eggId) missing.push('eggId');
  if (!dockerImage) missing.push('dockerImage');
  if (!startupCommand) missing.push('startupCommand');

  if (missing.length > 0) {
    const err = new Error(`MISSING: ${missing.join(', ')} — hazipo kwenye config.`);
    err.status = 400;
    throw err;
  }

  // ============================
  // RESOURCE VALUES
  // ============================
  const finalMemory = Number(memory) || DEFAULT_MEMORY;
  const finalDisk = Number(disk) || DEFAULT_DISK;
  const finalCpu = Number(cpu) || DEFAULT_CPU;
  const finalPort = Number(allocationPort) || ALLOCATION_PORT;

  // ============================
  // ENVIRONMENT VARIABLES
  // ============================
  const env = {};
  Object.keys(environmentVariables).forEach((key) => {
    env[key] = String(environmentVariables[key]);
  });

  // ============================
  // EXPLICIT PAYLOAD
  // ============================
  const payload = {
    name,
    user: Number(userId),
    description: description || null,
    egg: Number(eggId),
    docker_image: dockerImage,
    startup: startupCommand,
    environment: env,

    limits: {
      memory: finalMemory,
      swap: DEFAULT_SWAP,
      disk: finalDisk,
      io: DEFAULT_IO,
      cpu: finalCpu,
    },

    feature_limits: {
      databases: 0,
      allocations: 1,
      backups: 0,
    },

    // Node — moja kwa moja
    deploy: {
      locations: [NODE_ID],      // [1]
      dedicated_ip: false,
      port_range: [`${finalPort}`],  // ["25565"]
    },

    // Allocation
    allocation: {
      default: finalPort,
    },

    start_on_completion: false,
    skip_scripts: false,
    oom_disabled: false,
  };

  logger.info('==================================================');
  logger.info('Pterodactyl createServer — EXPLICIT PAYLOAD');
  logger.info('==================================================');
  logger.info(`  Node (deploy.locations): ${NODE_ID}`);
  logger.info(`  Port: ${finalPort}`);
  logger.info(`  Memory: ${finalMemory} MB`);
  logger.info(`  Disk: ${finalDisk} MB`);
  logger.info(`  CPU: ${finalCpu}%`);
  logger.info(`  Egg: ${eggId}, Nest: ${nestId}`);
  logger.info(`  User: ${userId}`);
  logger.info('==================================================');
  logger.info(`Full payload: ${JSON.stringify(payload)}`);

  try {
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
  } catch (err) {
    if (err.pterodactyl) {
      logger.error(`Pterodactyl createServer error details: ${JSON.stringify(err.pterodactyl)}`);
    }
    throw err;
  }
}

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
// NODES (read-only — kwa admin settings)
// ============================

async function getNodes() {
  try {
    const response = await pterodactyl.get('/nodes');
    return (response.data.data || []).map((n) => n.attributes);
  } catch (err) {
    logger.error(`getNodes error: ${err.message}`);
    return [];
  }
}

async function getAllocationsByNode(nodeId) {
  try {
    const response = await pterodactyl.get(`/nodes/${nodeId}/allocations`, {
      params: { per_page: 100 },
    });
    return (response.data.data || []).map((a) => a.attributes);
  } catch (err) {
    logger.warn(`getAllocationsByNode(${nodeId}) error: ${err.message}`);
    return [];
  }
}

// ============================
// NESTS & EGGS
// ============================

async function getNests() {
  try {
    const response = await pterodactyl.get('/nests');
    return (response.data.data || []).map((n) => n.attributes);
  } catch (err) {
    logger.error(`getNests error: ${err.message}`);
    return [];
  }
}

async function getEggsByNest(nestId) {
  const response = await pterodactyl.get(`/nests/${nestId}/eggs`);
  return (response.data.data || []).map((e) => e.attributes);
}

// ============================
// HEALTH
// ============================

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
  createUser,
  getUser,
  findUserByEmail,
  ensureUser,
  updateUser,
  deleteUser,

  createServer,
  getServer,
  getServerByExternalId,
  updateServer,
  updateServerBuild,
  updateServerStartup,

  suspendServer,
  unsuspendServer,
  reinstallServer,
  deleteServer,

  getNodes,
  getAllocationsByNode,

  getNests,
  getEggsByNest,
  healthCheck,

  // Hardcoded constants
  NODE_ID,
  ALLOCATION_PORT,
  DEFAULT_MEMORY,
  DEFAULT_DISK,
  DEFAULT_CPU,
};
