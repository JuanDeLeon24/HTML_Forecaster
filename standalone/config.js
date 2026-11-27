'use strict';
/**
 * Configuración de la versión de archivo único (navegador). Sustituye a backend/config.js
 * en el empaquetado. Los ajustes editables se guardan en el propio navegador (localStorage).
 */
const SETTINGS_KEY = 'hf-settings';

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
}
const s = loadSettings();

const config = {
  standalone: true,
  root: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  provider: 'sofascore',
  logLevel: 'info',
  sofascore: { baseUrl: s.baseUrl || 'https://api.sofascore.com/api/v1' },
  http: { minIntervalMs: s.intervalMs ?? 450, retries: 2, timeoutMs: 15000 },
  collection: {
    historyDepth: s.historyDepth ?? 20,
    statsDepth: s.statsDepth ?? 10,
    h2hStatsDepth: 5,
    tournaments: Array.isArray(s.tournaments) ? s.tournaments : [17, 18, 8, 23, 35, 34, 7, 679, 17015],
    maxMatches: s.maxMatches ?? 0,
    bootstrapSeasons: 2,
  },
  // En el archivo único solo se usa Sofascore (vía recolector); estas claves existen para que el código compartido no falle
  fallbackProvider: null,
  footballData: { competitions: [], minIntervalMs: 6500 },
  apiFootball: { leagues: [], minIntervalMs: 6500 },
  whatsapp: { enabled: false, autoSend: false },
  scheduler: { enabled: false },
  model: require('../backend/modelConfig'),
  settingsKey: SETTINGS_KEY,
};

/** Aplica y guarda ajustes editables. */
config.saveSettings = (next) => {
  const merged = { ...loadSettings(), ...next };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged)); } catch { /* sin almacenamiento */ }
  if (merged.baseUrl) config.sofascore.baseUrl = merged.baseUrl;
  if (merged.intervalMs !== undefined) config.http.minIntervalMs = merged.intervalMs;
  if (merged.historyDepth !== undefined) config.collection.historyDepth = merged.historyDepth;
  if (merged.statsDepth !== undefined) config.collection.statsDepth = merged.statsDepth;
  if (merged.tournaments) config.collection.tournaments = merged.tournaments;
  if (merged.maxMatches !== undefined) config.collection.maxMatches = merged.maxMatches;
  return merged;
};

module.exports = config;
