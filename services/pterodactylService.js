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

  logger.info(`Pterodactyl user imeundwa: id=${attrs.id}, username=${username}, email=${email}`);

  return {
    id: attrs.id,
    username: attrs.username,
    email: attrs.email,
    password,
  };
}

async function ensureUser({ email, username, firstName, lastName }) {
  let existing = await findUserByEmail(email);

  if (existing) {
    return {
      id: existing.id,
      username: existing.username,
      email: existing.email,
      created: false,
    };
  }

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
// NODES & ALLOCATIONS
// ============================

/**
 * Pata nodes zote
 */
async function getNodes() {
  try {
    const response = await pterodactyl.get('/nodes');
    return (response.data.data || []).map((n) => n.attributes);
  } catch (err) {
    logger.error(`getNodes error: ${err.message}`);
    return [];
  }
}

/**
 * Pata allocations zote za node
 */
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

/**
 * TAFUTA NODE INAYOFAA KWA DEPLOYMENT
 * - Kama preferredNodeId imetolewa, jaribu kuitumia kwanza
 * - Kama haina allocation free, tafuta node nyingine
 * - Inarudisha { nodeId, allocationId, nodeName }
 *
 * @param {Number|null} preferredNodeId - Node ID iliyopendekezwa (kutoka admin)
 * @param {Array<Number>} [allowedNodeIds] - Nodes zilizoruhusiwa (optional)
 * @returns {Object} { nodeId, allocationId, nodeName }
 */
async function findAvailableNodeAndAllocation(preferredNodeId = null) {
  // 1. Chukua nodes zote
  const nodes = await getNodes();

  if (!nodes || nodes.length === 0) {
    const err = new Error('Hakuna node iliyopatikana kwenye Pterodactyl.');
    err.status = 503;
    throw err;
  }

  logger.info(
    `findAvailableNodeAndAllocation: nodes zilizopatikana: ${nodes.map((n) => `${n.id}(${n.name})`).join(', ')}`
  );

  // 2. Panga nodes: ile preferred kwanza, kisha nyingine
  const orderedNodes = [...nodes];
  if (preferredNodeId) {
    const idx = orderedNodes.findIndex((n) => Number(n.id) === Number(preferredNodeId));
    if (idx > 0) {
      const [pref] = orderedNodes.splice(idx, 1);
      orderedNodes.unshift(pref);
    }
    if (idx === -1) {
      logger.warn(
        `findAvailableNodeAndAllocation: preferred node ${preferredNodeId} haipo. Tutatumia node nyingine.`
      );
    }
  }

  // 3. Kwa kila node, angalia kama ina allocation free
  for (const node of orderedNodes) {
    try {
      const allocations = await getAllocationsByNode(node.id);

      // Allocation free = haina server (assigned = false)
      const freeAllocation = allocations.find((a) => !a.assigned);

      if (freeAllocation) {
        logger.info(
          `findAvailableNodeAndAllocation: tumia node=${node.id} (${node.name}), allocation=${freeAllocation.id} (${freeAllocation.ip}:${freeAllocation.port})`
        );
        return {
          nodeId: node.id,
          nodeName: node.name,
          allocationId: freeAllocation.id,
          allocationIp: freeAllocation.ip,
          allocationPort: freeAllocation.port,
        };
      }

      logger.warn(
        `findAvailableNodeAndAllocation: node ${node.id} (${node.name}) haina allocation free. Tunaendelea...`
      );
    } catch (err) {
      logger.warn(
        `findAvailableNodeAndAllocation: kosa kwa node ${node.id}: ${err.message}. Tunaendelea...`
      );
    }
  }

  const err = new Error(
    'Hakuna node yenye allocation inayopatikana. Ongeza allocations kwenye Pterodactyl node.'
  );
  err.status = 503;
  throw err;
}

// ============================
// SERVERS
// ============================

/**
 * Unda server kwenye Pterodactyl
 */
async function createServer(config) {
  const {
    name,
    userId,
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

  // Environment variables
  const env = {};
  Object.keys(environmentVariables).forEach((key) => {
    env[key] = String(environmentVariables[key]);
  });

  const payload = {
    name,
    user: Number(userId),
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

  logger.info(
    `createServer payload: user=${userId}, egg=${eggId}, node=${nodeId}, allocation=${allocationId}`
  );

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
  // Users
  createUser,
  getUser,
  findUserByEmail,
  ensureUser,
  updateUser,
  deleteUser,

  // Nodes & Allocations
  getNodes,
  getAllocationsByNode,
  findAvailableNodeAndAllocation,

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
  getNests,
  getEggsByNest,
  healthCheck,
};
