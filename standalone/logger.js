'use strict';
/** Logger de navegador: consola del navegador (F12) + últimas líneas en memoria para la página de Datos. */
const buffer = [];
function write(level, scope, msg, ctx) {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} [${scope}] ${msg}${ctx === undefined ? '' : ' ' + safe(ctx)}`;
  buffer.push(line);
  if (buffer.length > 300) buffer.shift();
  (level === 'error' || level === 'warn' ? console.warn : console.log)(line);
}
function safe(v) {
  if (v instanceof Error) return v.message;
  try { return JSON.stringify(v); } catch { return String(v); }
}
function createLogger(scope) {
  return {
    debug: () => {},
    info: (m, c) => write('info', scope, m, c),
    warn: (m, c) => write('warn', scope, m, c),
    error: (m, c) => write('error', scope, m, c),
  };
}
module.exports = { createLogger, logBuffer: buffer };
