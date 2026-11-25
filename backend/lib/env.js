'use strict';
/**
 * Cargador mínimo de archivos .env (sin dependencias externas).
 * No sobrescribe variables ya definidas en el entorno.
 */
const fs = require('node:fs');
const path = require('node:path');

function loadEnv(file = path.resolve(__dirname, '../../.env')) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

module.exports = { loadEnv };
