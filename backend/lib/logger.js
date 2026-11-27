'use strict';
/**
 * Logger estructurado simple: consola + archivo (append).
 * Formato: ISO_TIMESTAMP LEVEL [modulo] mensaje {contexto}
 */
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

let stream = null;
let errorStream = null;
try {
  fs.mkdirSync(path.dirname(config.logFile), { recursive: true });
  stream = fs.createWriteStream(config.logFile, { flags: 'a' });
  const errorFile = path.join(path.dirname(config.logFile), 'errors.log');
  errorStream = fs.createWriteStream(errorFile, { flags: 'a' });
} catch {
  stream = null;
  errorStream = null;
}

function write(level, scope, msg, ctx) {
  if (LEVELS[level] < threshold) return;
  const extra = ctx === undefined ? '' : ' ' + safeJson(ctx);
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}${extra}`;
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
  if (stream && process.env.NODE_ENV !== 'test') {
    try {
      if (fs.statSync(config.logFile).size > 5 * 1024 * 1024) {
        stream.end();
        fs.renameSync(config.logFile, config.logFile + '.1');
        stream = fs.createWriteStream(config.logFile, { flags: 'a' });
      }
    } catch (e) { /* ignore */ }
    stream.write(line + '\n');
  }
  if (level === 'error' && errorStream && process.env.NODE_ENV !== 'test') {
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, scope, message: msg, context: ctx === undefined ? null : (ctx instanceof Error ? { error: ctx.message, stack: ctx.stack } : ctx) });
    errorStream.write(entry + '\n');
  }
}

function safeJson(v) {
  if (v instanceof Error) return JSON.stringify({ error: v.message, stack: v.stack?.split('\n').slice(0, 3).join(' | ') });
  try { return JSON.stringify(v); } catch { return String(v); }
}

function createLogger(scope) {
  return {
    debug: (m, c) => write('debug', scope, m, c),
    info: (m, c) => write('info', scope, m, c),
    warn: (m, c) => write('warn', scope, m, c),
    error: (m, c) => write('error', scope, m, c),
  };
}

module.exports = { createLogger };
