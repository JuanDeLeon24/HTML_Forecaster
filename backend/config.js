'use strict';
/**
 * Configuración central. Todos los parámetros ajustables viven aquí para
 * mantener trazabilidad (cada pronóstico guarda la versión de modelo usada).
 */
const path = require('node:path');
const { loadEnv } = require('./lib/env');

loadEnv();

const int = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : parseInt(v, 10));
const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

const ROOT = path.resolve(__dirname, '..');

const config = {
  root: ROOT,
  port: int(process.env.PORT, 3000),
  host: process.env.HOST || '127.0.0.1',
  timezone: process.env.TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  dbPath: path.resolve(ROOT, process.env.DB_PATH || './data/forecaster.db'),
  logLevel: process.env.LOG_LEVEL || 'info',
  logFile: path.resolve(ROOT, process.env.LOG_FILE || './logs/app.log'),

  provider: process.env.DATA_PROVIDER || 'sofascore',
  sofascore: {
    baseUrl: process.env.SOFASCORE_BASE_URL || 'https://api.sofascore.com/api/v1',
  },
  http: {
    minIntervalMs: int(process.env.REQUEST_INTERVAL_MS, 450),
    retries: int(process.env.REQUEST_RETRIES, 3),
    timeoutMs: int(process.env.REQUEST_TIMEOUT_MS, 15000),
  },
  collection: {
    historyDepth: Math.min(int(process.env.HISTORY_DEPTH, 20), 50),
    statsDepth: Math.min(int(process.env.STATS_DEPTH, 10), 50),
    h2hStatsDepth: Math.min(int(process.env.H2H_STATS_DEPTH, 5), 20),
    tournaments: list(process.env.TOURNAMENTS).map(Number),
    maxMatches: int(process.env.MAX_MATCHES, 0),
  },
  scheduler: {
    enabled: process.env.SCHEDULER_ENABLED === '1',
  },

  model: require('./modelConfig'),
};

module.exports = config;
