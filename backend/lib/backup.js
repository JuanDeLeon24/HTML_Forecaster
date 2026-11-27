'use strict';
/**
 * Copias de seguridad de SQLite (solo versión servidor):
 *   storage/backups/daily   (se conservan 7)
 *   storage/backups/weekly  (lunes, se conservan 4)
 *   storage/backups/monthly (día 1, se conservan 12)
 * Usa `VACUUM INTO` (copia consistente sin detener la aplicación).
 * Restauración automática: si la base no supera `PRAGMA integrity_check` al abrir, se reemplaza
 * por la copia válida más reciente (ver database/db.js).
 */
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const { createLogger } = require('./logger');

const log = createLogger('backup');
const ROOT = path.join(config.root, 'storage', 'backups');
const KEEP = { daily: 7, weekly: 4, monthly: 12 };

function prune(dir, keep) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort().reverse();
  for (const f of files.slice(keep)) fs.rmSync(path.join(dir, f));
}

function backupNow(conn, { date = new Date() } = {}) {
  const stamp = date.toISOString().slice(0, 10);
  const kinds = ['daily'];
  if (date.getUTCDay() === 1) kinds.push('weekly');
  if (date.getUTCDate() === 1) kinds.push('monthly');
  const done = [];
  for (const kind of kinds) {
    const dir = path.join(ROOT, kind);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `forecaster-${stamp}.db`);
    if (fs.existsSync(file)) continue;
    conn.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    prune(dir, KEEP[kind]);
    done.push(file);
  }
  if (done.length) log.info('Copia de seguridad creada', { files: done });
  return done;
}

function latestBackup() {
  const all = [];
  for (const kind of Object.keys(KEEP)) {
    const dir = path.join(ROOT, kind);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.db')) all.push(path.join(dir, f));
  }
  return all.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] ?? null;
}

module.exports = { backupNow, latestBackup, BACKUP_ROOT: ROOT };
