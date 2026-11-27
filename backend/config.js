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
  // Proveedor de respaldo: se usa automáticamente si el principal falla (football-data | api-football | sofascore)
  fallbackProvider: process.env.FALLBACK_PROVIDER || null,
  sofascore: {
    baseUrl: process.env.SOFASCORE_BASE_URL || 'https://api.sofascore.com/api/v1',
  },
  // football-data.org (plan gratuito: 10 peticiones/min; resultados y calendario, sin estadísticas ni cuotas)
  footballData: {
    baseUrl: process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4',
    apiKey: process.env.FOOTBALL_DATA_API_KEY || null,
    // PL, Championship, LaLiga, Bundesliga, Serie A, Ligue 1, Champions League
    competitions: list(process.env.FOOTBALL_DATA_COMPETITIONS || '2021,2016,2014,2002,2019,2015,2001').map(Number),
    minIntervalMs: int(process.env.FOOTBALL_DATA_INTERVAL_MS, 6500),
  },
  // API-Football (api-sports.io; plan gratuito: 100 peticiones/día, 10/min)
  apiFootball: {
    baseUrl: process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io',
    apiKey: process.env.API_FOOTBALL_API_KEY || null,
    // PL, Championship, LaLiga, Bundesliga, Serie A, Ligue 1, UCL, UEL, UECL
    leagues: list(process.env.API_FOOTBALL_LEAGUES || '39,40,140,78,135,61,2,3,848').map(Number),
    minIntervalMs: int(process.env.API_FOOTBALL_INTERVAL_MS, 6500),
  },
  whatsapp: {
    enabled: process.env.WHATSAPP_ENABLED === '1',
    autoSend: process.env.WHATSAPP_AUTO === '1',
    // WhatsApp Web (tu propia cuenta): número de destino solo dígitos con código de país, p. ej. 573001234567
    webTo: (process.env.WHATSAPP_WEB_TO || '').replace(/\D/g, '') || null,
    provider: process.env.WHATSAPP_PROVIDER || 'meta', // meta | twilio
    meta: { token: process.env.WHATSAPP_META_TOKEN || null, phoneId: process.env.WHATSAPP_META_PHONE_ID || null, to: process.env.WHATSAPP_TO || null },
    twilio: { sid: process.env.TWILIO_SID || null, token: process.env.TWILIO_TOKEN || null, from: process.env.TWILIO_FROM || null, to: process.env.WHATSAPP_TO || null },
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
    // Carga inicial del histórico: temporadas completas a descargar por competición (actual + anteriores)
    bootstrapSeasons: Math.min(Math.max(int(process.env.BOOTSTRAP_SEASONS, 2), 1), 5),
  },
  scheduler: {
    enabled: process.env.SCHEDULER_ENABLED === '1',
  },

  model: require('./modelConfig'),
};

module.exports = config;
