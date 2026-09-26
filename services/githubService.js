/**
 * DVARY HOSTING
 * FILE: services/githubService.js
 * Service ya kuhakiki na kupata taarifa za GitHub repositories
 * HAITUMII token yoyote kwa sasa — public API pekee (rate-limited)
 */

'use strict';

const axios = require('axios');
const logger = require('../utils/logger');

// ============================
// GITHUB API CLIENT (public, no auth)
// ============================
const github = axios.create({
  baseURL: 'https://api.github.com',
  timeout: 15000,
  headers: {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'DVARY-HOSTING',
  },
});

// ============================
// REGEX YA GITHUB URL
// ============================
const GITHUB_URL_REGEX = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i;

// ============================
// VALIDATE URL
// ============================
/**
 * Hakiki kama string ni GitHub repo URL sahihi
 * @returns {Object|null} { owner, repo } au null
 */
function parseGithubUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.trim().match(GITHUB_URL_REGEX);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/i, ''),
  };
}

/**
 * Boolean rahisi
 */
function isValidGithubUrl(url) {
  return parseGithubUrl(url) !== null;
}

// ============================
// GET REPO INFO
// ============================
/**
 * Pata taarifa za repo kutoka GitHub public API
 * @returns {Object|null} { name, fullName, defaultBranch, private, description, htmlUrl, cloneUrl } au null
 */
async function getRepoInfo(owner, repo) {
  try {
    const response = await github.get(`/repos/${owner}/${repo}`);
    const data = response.data;

    return {
      name: data.name,
      fullName: data.full_name,
      defaultBranch: data.default_branch,
      private: data.private,
      description: data.description,
      htmlUrl: data.html_url,
      cloneUrl: data.clone_url,
      language: data.language,
      stars: data.stargazers_count,
      forks: data.forks_count,
      updatedAt: data.updated_at,
    };
  } catch (err) {
    if (err.response && err.response.status === 404) {
      logger.warn(`GitHub repo haipo: ${owner}/${repo}`);
      return null;
    }
    if (err.response && err.response.status === 403) {
      logger.warn('GitHub API rate limit imefikiwa.');
      const wrapped = new Error('GitHub API rate limit imefikiwa. Jaribu tena baadaye.');
      wrapped.status = 429;
      throw wrapped;
    }
    logger.error(`GitHub getRepoInfo error: ${err.message}`);
    throw err;
  }
}

/**
 * Pata repo info kwa URL moja kwa moja
 */
async function getRepoInfoByUrl(url) {
  const parsed = parseGithubUrl(url);
  if (!parsed) {
    const err = new Error('GitHub URL si sahihi.');
    err.status = 400;
    throw err;
  }
  return getRepoInfo(parsed.owner, parsed.repo);
}

// ============================
// LIST BRANCHES
// ============================
/**
 * Pata branches za repo
 * @returns {Array<{name, protected}>}
 */
async function getBranches(owner, repo) {
  try {
    const response = await github.get(`/repos/${owner}/${repo}/branches`, {
      params: { per_page: 100 },
    });
    return response.data.map((b) => ({
      name: b.name,
      protected: b.protected,
    }));
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return [];
    }
    logger.error(`GitHub getBranches error: ${err.message}`);
    throw err;
  }
}

async function getBranchesByUrl(url) {
  const parsed = parseGithubUrl(url);
  if (!parsed) {
    const err = new Error('GitHub URL si sahihi.');
    err.status = 400;
    throw err;
  }
  return getBranches(parsed.owner, parsed.repo);
}

// ============================
// CHECK REPO EXISTS
// ============================
/**
 * Angalia kama repo ipo na public
 * @returns {Boolean}
 */
async function repoExists(url) {
  const parsed = parseGithubUrl(url);
  if (!parsed) return false;

  try {
    const response = await github.get(`/repos/${parsed.owner}/${parsed.repo}`);
    return !response.data.private;
  } catch (err) {
    if (err.response && err.response.status === 404) return false;
    logger.error(`GitHub repoExists error: ${err.message}`);
    return false;
  }
}

// ============================
// CHECK BRANCH EXISTS
// ============================
async function branchExists(url, branch) {
  const parsed = parseGithubUrl(url);
  if (!parsed || !branch) return false;

  try {
    await github.get(`/repos/${parsed.owner}/${parsed.repo}/branches/${branch}`);
    return true;
  } catch (err) {
    if (err.response && err.response.status === 404) return false;
    logger.error(`GitHub branchExists error: ${err.message}`);
    return false;
  }
}

// ============================
// VALIDATE FOR DEPLOYMENT
// ============================
/**
 * Hakiki GitHub URL + branch kwa deployment
 * @returns {Object} { valid, reason?, info? }
 */
async function validateForDeployment(url, branch = 'main') {
  const parsed = parseGithubUrl(url);
  if (!parsed) {
    return { valid: false, reason: 'GitHub URL si sahihi.' };
  }

  const info = await getRepoInfo(parsed.owner, parsed.repo);
  if (!info) {
    return { valid: false, reason: 'GitHub repository haipo au ni private.' };
  }

  if (info.private) {
    return { valid: false, reason: 'GitHub repository ni private — haiwezi ku-deploy.' };
  }

  const branches = await getBranches(parsed.owner, parsed.repo);
  const branchNames = branches.map((b) => b.name);

  if (!branchNames.includes(branch)) {
    return {
      valid: false,
      reason: `Branch "${branch}" haipo. Branches zilizopo: ${branchNames.join(', ') || 'hakuna'}`,
      info,
    };
  }

  return { valid: true, info };
}

// ============================
// EXPORTS
// ============================
module.exports = {
  parseGithubUrl,
  isValidGithubUrl,
  getRepoInfo,
  getRepoInfoByUrl,
  getBranches,
  getBranchesByUrl,
  repoExists,
  branchExists,
  validateForDeployment,
};
