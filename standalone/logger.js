'use strict';
/** Logger de navegador: consola (F12) + memoria para la página «Datos y ajustes». Misma interfaz que backend/lib/logger. */
const buffer = [];
const errors = [];
function push(line) { buffer.push(line); if (buffer.length > 400) buffer.shift(); }
function safe(v) {
  if (v instanceof Error) return v.message;
  try { return JSON.stringify(v); } catch { return String(v); }
}
function write(level, scope, msg, ctx) {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} [${scope}] ${msg}${ctx === undefined ? '' : ' ' + safe(ctx)}`;
  push(line);
  (level === 'error' || level === 'warn' ? console.warn : console.log)(line);
  if (level === 'error') recordError({ source: scope, endpoint: ctx?.url ?? null, error: ctx instanceof Error ? ctx.message : msg, impact: ctx?.impact ?? 'desconocido' });
}
function recordError({ source, endpoint = null, error, impact = 'desconocido' }) {
  const e = { timestamp: new Date().toISOString(), source, endpoint, error: String(error), impact };
  errors.push(e); if (errors.length > 300) errors.shift();
  push(`ERRORLOG ${JSON.stringify(e)}`);
  return e;
}
const logPrediction = () => {};
const logApi = () => {};
function createLogger(scope) {
  return { debug: () => {}, info: (m, c) => write('info', scope, m, c), warn: (m, c) => write('warn', scope, m, c), error: (m, c) => write('error', scope, m, c) };
}
module.exports = { createLogger, recordError, logPrediction, logApi, logBuffer: buffer, errorBuffer: errors };
