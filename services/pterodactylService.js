/**
 * DVARY HOSTING
 * FILE: services/pterodactylService.js
 * Service ya kufanya operations zote za Pterodactyl Application API
 * API key inatumika BACKEND pekee - haitoki frontend kamwe
 */

'use strict';

const pterodactyl = require('../config/pterodactyl');
const logger = require('../utils/logger');
const {
  generatePassword,
  generateUsername
} = require('../utils/generatePassword');

// ============================
// USERS
// ============================

/**
 * Unda user kwenye Pterodactyl
 * @param {Object} data - { email, username, firstName, lastName, password? }
 */
async function createUser(data) {
  const {
    email,
    firstName = 'DVARY',
    lastName = 'User'
  } = data;

  if (!email) {
    const err = new Error(
      'Email inahitajika kuunda Pterodactyl user.'
    );
    err.status = 400;
    throw err;
  }

  const username =
    data.username ||
    generateUsername(email.split('@')[0]);

  const password =
    data.password ||
    generatePassword(16);

  const payload = {
    email,
    username,
    first_name: firstName,
    last_name: lastName,
    password,
  };

  const response = await pterodactyl.post(
    '/users',
    payload
  );

  logger.info(
    `Pterodactyl user imeundwa: id=${response.data.attributes.id}, username=${username}`
  );

  return {
    id: response.data.attributes.id,
    username: response.data.attributes.username,
    email: response.data.attributes.email,
    password,
  };
}

/**
 * Pata user kwa ID
 */
async function getUser(userId) {
  const response = await pterodactyl.get(
    `/users/${userId}`
  );

  return response.data.attributes;
}

/**
 * Pata user kwa email
 */
async function findUserByEmail(email) {
  const response = await pterodactyl.get(
    '/users',
    {
      params: {
        filter: {
          email
        }
      }
    }
  );

  const users = response.data.data || [];

  if (users.length === 0) {
    return null;
  }

  return users[0].attributes;
}

/**
 * Update user
 */
async function updateUser(userId, data) {
  const response = await pterodactyl.patch(
    `/users/${userId}`,
    data
  );

  return response.data.attributes;
}

/**
 * Delete user
 */
async function deleteUser(userId) {
  await pterodactyl.delete(
    `/users/${userId}`
  );

  logger.info(
    `Pterodactyl user imefutwa: id=${userId}`
  );

  return true;
}

// ============================
// SERVERS
// ============================

/**
 * Unda server kwenye Pterodactyl
 *
 * GitHub URL na branch vinatoka kwenye
 * configuration ya bot iliyowekwa na ADMIN.
 *
 * @param {Object} config
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

    githubUrl = null,
    githubBranch = 'main',

    memory = null,
    swap = 0,
    io = 500,

    startOnCompletion = true,
    skipScripts = false,
    oomDisabled = false,
  } = config;

  // ============================
  // VALIDATION
  // ============================

  const missing = [];

  if (!name) {
    missing.push('name');
  }

  if (!userId) {
    missing.push('userId');
  }

  /*
   * Support zote:
   *
   * ram inaweza kutumika kama project yako
   * inatumia ram.
   *
   * memory inaweza kutumika kama caller mpya
   * ametuma memory.
   */
  const finalRam =
    ram !== undefined && ram !== null
      ? ram
      : memory;

  if (
    finalRam === undefined ||
    finalRam === null
  ) {
    missing.push('ram');
  }

  if (
    cpu === undefined ||
    cpu === null
  ) {
    missing.push('cpu');
  }

  if (
    disk === undefined ||
    disk === null
  ) {
    missing.push('disk');
  }

  if (!nodeId) {
    missing.push('nodeId');
  }

  if (!nestId) {
    missing.push('nestId');
  }

  if (!eggId) {
    missing.push('eggId');
  }

  if (!dockerImage) {
    missing.push('dockerImage');
  }

  if (!startupCommand) {
    missing.push('startupCommand');
  }

  /*
   * Kwa deployment ya allocation maalum,
   * allocationId inahitajika.
   */
  if (!allocationId) {
    missing.push('allocationId');
  }

  /*
   * GitHub repo inahitajika kama bot
   * inatakiwa ku-clone kutoka GitHub.
   */
  if (!githubUrl) {
    missing.push('githubUrl');
  }

  if (missing.length > 0) {
    const err = new Error(
      `MISSING: ${missing.join(', ')} — hazipo kwenye config ya admin/deployment.`
    );

    err.status = 400;

    throw err;
  }

  // ============================
  // ENVIRONMENT VARIABLES
  // ============================

  const env = {};

  Object.keys(environmentVariables || {}).forEach(
    (key) => {
      env[key] = String(
        environmentVariables[key]
      );
    }
  );

  /*
   * GitHub variables zinawekwa automatically.
   *
   * Hivyo customer hahitaji kuandika
   * GitHub URL.
   */

  env.GITHUB_REPO = String(
    githubUrl
  );

  env.GITHUB_BRANCH = String(
    githubBranch || 'main'
  );

  // ============================
  // PAYLOAD
  // ============================

  const payload = {
    name,

    user: Number(userId),

    description:
      description || null,

    nest: Number(nestId),

    egg: Number(eggId),

    docker_image: dockerImage,

    startup: startupCommand,

    environment: env,

    limits: {
      memory: Number(finalRam),
      swap: Number(swap || 0),
      disk: Number(disk),
      io: Number(io || 500),
      cpu: Number(cpu),
    },

    feature_limits: {
      databases: 0,
      allocations: 1,
      backups: 0,
    },

    /*
     * HAPA HATUTUMII:
     *
     * deploy.locations: [nodeId]
     *
     * kwa sababu Pterodactyl inataka
     * Location ID kwenye locations,
     * si Node ID.
     *
     * Allocation maalum ndiyo inaamua
     * node/port itakayotumika.
     */

    allocation: {
      default: Number(allocationId),
    },

    start_on_completion:
      Boolean(startOnCompletion),

    skip_scripts:
      Boolean(skipScripts),

    oom_disabled:
      Boolean(oomDisabled),
  };

  // ============================
  // CREATE SERVER
  // ============================

  try {
    logger.info(
      `Creating Pterodactyl server: ${name}`
    );

    logger.info(
      `GitHub repository: ${githubUrl}`
    );

    logger.info(
      `GitHub branch: ${githubBranch || 'main'}`
    );

    logger.info(
      `Node ID: ${nodeId}`
    );

    logger.info(
      `Allocation ID: ${allocationId}`
    );

    const response =
      await pterodactyl.post(
        '/servers',
        payload
      );

    const attrs =
      response.data.attributes;

    logger.info(
      `Pterodactyl server imeundwa: id=${attrs.id}, identifier=${attrs.identifier}`
    );

    return {
      id: attrs.id,

      identifier:
        attrs.identifier,

      uuid:
        attrs.uuid,

      name:
        attrs.name,

      status:
        attrs.status,

      user:
        attrs.user,

      node:
        attrs.node,

      allocation:
        attrs.allocation,

      limits:
        attrs.limits,

      feature_limits:
        attrs.feature_limits,
    };

  } catch (error) {

    const data =
      error.response?.data;

    logger.error(
      `PTERODACTYL CREATE SERVER ERROR: ${
        JSON.stringify(
          data || error.message,
          null,
          2
        )
      }`
    );

    const detail =
      data?.errors?.[0]?.detail ||
      data?.errors?.[0]?.code ||
      data?.message ||
      error.message ||
      'Pterodactyl server creation failed';

    const err = new Error(detail);

    err.status =
      error.response?.status || 500;

    err.pterodactyl =
      data || null;

    throw err;
  }
}

/**
 * Pata server kwa ID
 */
async function getServer(serverId) {
  const response =
    await pterodactyl.get(
      `/servers/${serverId}`
    );

  return response.data.attributes;
}

/**
 * Pata server kwa external ID
 */
async function getServerByExternalId(
  externalId
) {
  const response =
    await pterodactyl.get(
      `/servers/external/${externalId}`
    );

  return response.data.attributes;
}

/**
 * Update server details
 */
async function updateServer(
  serverId,
  data
) {
  const response =
    await pterodactyl.patch(
      `/servers/${serverId}/details`,
      data
    );

  return response.data.attributes;
}

/**
 * Update build
 */
async function updateServerBuild(
  serverId,
  data
) {
  const response =
    await pterodactyl.patch(
      `/servers/${serverId}/build`,
      data
    );

  return response.data.attributes;
}

/**
 * Update startup
 */
async function updateServerStartup(
  serverId,
  data
) {
  const response =
    await pterodactyl.patch(
      `/servers/${serverId}/startup`,
      data
    );

  return response.data.attributes;
}

// ============================
// SERVER ACTIONS
// ============================

/**
 * Suspend server
 */
async function suspendServer(serverId) {
  await pterodactyl.post(
    `/servers/${serverId}/suspend`
  );

  logger.info(
    `Pterodactyl server imesimamishwa: id=${serverId}`
  );

  return true;
}

/**
 * Unsuspend server
 */
async function unsuspendServer(serverId) {
  await pterodactyl.post(
    `/servers/${serverId}/unsuspend`
  );

  logger.info(
    `Pterodactyl server imeanzishwa tena: id=${serverId}`
  );

  return true;
}

/**
 * Reinstall server
 */
async function reinstallServer(
  serverId
) {
  await pterodactyl.post(
    `/servers/${serverId}/reinstall`
  );

  logger.info(
    `Pterodactyl server inareinstall: id=${serverId}`
  );

  return true;
}

/**
 * Delete server
 */
async function deleteServer(serverId) {
  await pterodactyl.delete(
    `/servers/${serverId}`
  );

  logger.info(
    `Pterodactyl server imefutwa: id=${serverId}`
  );

  return true;
}

// ============================
// UTILITIES
// ============================

/**
 * Pata nodes zote zilizopo
 */
async function getNodes() {
  const response =
    await pterodactyl.get(
      '/nodes'
    );

  return (
    response.data.data || []
  ).map(
    (n) => n.attributes
  );
}

/**
 * Pata nests zote
 */
async function getNests() {
  const response =
    await pterodactyl.get(
      '/nests'
    );

  return (
    response.data.data || []
  ).map(
    (n) => n.attributes
  );
}

/**
 * Pata eggs kwa nest
 */
async function getEggsByNest(
  nestId
) {
  const response =
    await pterodactyl.get(
      `/nests/${nestId}/eggs`
    );

  return (
    response.data.data || []
  ).map(
    (e) => e.attributes
  );
}

/**
 * Pata allocations kwa node
 */
async function getAllocationsByNode(
  nodeId
) {
  const response =
    await pterodactyl.get(
      `/nodes/${nodeId}/allocations`
    );

  return (
    response.data.data || []
  ).map(
    (a) => a.attributes
  );
}

/**
 * Health check
 */
async function healthCheck() {
  try {
    await pterodactyl.get(
      '/nodes'
    );

    return true;

  } catch (err) {

    logger.error(
      `Pterodactyl health check imefail: ${err.message}`
    );

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
