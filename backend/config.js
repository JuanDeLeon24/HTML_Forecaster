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

  /**
   * Parámetros de modelo por defecto. El motor de aprendizaje puede
   * sobrescribirlos (tabla model_params) cuando hay muestra suficiente.
   */
  model: {
    version: '0.3.0',
    // Nivel 1 – modelo ponderado (suma = 1)
    weightedFactors: { form: 0.35, h2h: 0.2, home: 0.1, attack: 0.2, defense: 0.15 },
    weightedSlope: 3.0,
    // Mezcla del 1X2 final entre modelos
    ensemble: { poisson: 0.5, elo: 0.25, weighted: 0.25 },
    // Dixon-Coles: rho típico en la literatura entre -0.05 y -0.15
    dixonColesRho: -0.08,
    // Elo
    eloK: 20,
    eloHomeAdvantage: 65,
    eloInitial: 1500,
    // Tasa base de empates si no hay datos suficientes en la base
    baseDrawRate: 0.26,
    // Encogimiento bayesiano hacia la media (equivale a N partidos "promedio")
    shrinkageGames: 3,
    // Vida media del decaimiento temporal (días)
    decayHalfLifeDays: 180,
    // Peso máximo del H2H sobre el total de goles esperado
    h2hGoalsWeight: 0.15,
    maxGoals: 10,
    // Muestra mínima por equipo para emitir pronóstico
    minTeamSample: 5,
    minStatsSample: 3,
  },
};

module.exports = config;
