/**
 * DVARY HOSTING
 * FILE: utils/logger.js
 * Simple logger yenye timestamp na rangi
 */

'use strict';

const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function format(level, color, args) {
  const prefix = `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${color}${level}${COLORS.reset}`;
  return [prefix, ...args];
}

const logger = {
  info(...args) {
    console.log(...format('INFO', COLORS.cyan, args));
  },

  success(...args) {
    console.log(...format('OK  ', COLORS.green, args));
  },

  warn(...args) {
    console.warn(...format('WARN', COLORS.yellow, args));
  },

  error(...args) {
    console.error(...format('ERR ', COLORS.red, args));
  },

  debug(...args) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(...format('DBG ', COLORS.magenta, args));
    }
  },
};

module.exports = logger;
