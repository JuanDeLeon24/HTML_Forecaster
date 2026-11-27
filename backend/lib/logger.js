'use strict';
/**
 * Logging estructurado con archivos separados y rotación por tamaño:
 *   logs/system.log       todo (info+)
 *   logs/errors.log       errores con {timestamp, source, endpoint, error, impact} (JSON por línea)
 *   logs/predictions.log  cada pronóstico emitido (JSON por línea)
 *   logs/api.log          peticiones a proveedores externos
 * Rotación: al superar 5 MB se renombra a .1 … .5 (se conservan 5).
 */
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;
const DIR = path.dirname(config.logFile);
const MAX_BYTES = 5 * 1024 * 1024;
const KEEP = 5;
const enabled = process.env.NODE_ENV !== 'test';

function rotate(file) {
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size < MAX_BYTES) return;
    for (let i = KEEP - 1; i >= 1; i--) if (fs.existsSync(`${file}.${i}`)) fs.renameSync(`${file}.${i}`, `${file}.${i + 1}`);
    fs.renameSync(file, `${file}.1`);
  } catch { /* la rotación nunca debe romper la aplicación */ }
}

function append(name, line) {
  if (!enabled) return;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const file = path.join(DIR, name);
    rotate(file);
    fs.appendFileSync(file, line + '\n');
  } catch { /* disco no disponible: se mantiene la consola */ }
}

function safeJson(v) {
  if (v instanceof Error) return JSON.stringify({ error: v.message, stack: v.stack?.split('\n').slice(0, 3).join(' | ') });
  try { return JSON.stringify(v); } catch { return String(v); }
}

function write(level, scope, msg, ctx) {
  if (LEVELS[level] < threshold) return;
  const extra = ctx === undefined ? '' : ' ' + safeJson(ctx);
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}${extra}`;
  if (process.env.NODE_ENV !== 'test' || level === 'error') (level === 'error' || level === 'warn' ? console.error : console.log)(line);
  append('system.log', line);
  if (level === 'error') recordError({ source: scope, endpoint: ctx?.url ?? ctx?.endpoint ?? null, error: ctx instanceof Error ? ctx.message : msg, impact: ctx?.impact ?? 'desconocido' });
}

/** Error estructurado (especificación: timestamp, API origen, endpoint, error, impacto). */
function recordError({ source, endpoint = null, error, impact = 'desconocido' }) {
  const entry = { timestamp: new Date().toISOString(), source, endpoint, error: String(error), impact };
  append('errors.log', JSON.stringify(entry));
  return entry;
}

const logPrediction = (entry) => append('predictions.log', JSON.stringify({ timestamp: new Date().toISOString(), ...entry }));
const logApi = (entry) => append('api.log', JSON.stringify({ timestamp: new Date().toISOString(), ...entry }));

function createLogger(scope) {
  return {
    debug: (m, c) => write('debug', scope, m, c),
    info: (m, c) => write('info', scope, m, c),
    warn: (m, c) => write('warn', scope, m, c),
    error: (m, c) => write('error', scope, m, c),
  };
}

module.exports = { createLogger, recordError, logPrediction, logApi };
