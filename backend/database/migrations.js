'use strict';
/**
 * Migraciones de base de datos (estructura base v0.4.0).
 * Ejecuta el esquema si falta. Para cambios futuros, añadir pasos versionados aquí.
 */
const fs = require('node:fs');
const path = require('node:path');

function applyMigrations(db) {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);`);
  // Añadir columna referee si falta (bases antiguas)
  try {
    const cols = db.all("PRAGMA table_info(matches)").map((c) => c.name);
    if (!cols.includes('referee')) db.exec('ALTER TABLE matches ADD COLUMN referee TEXT;');
  } catch (e) { /* ignore */ }
  const row = db.get('SELECT MAX(version) AS v FROM schema_version');
  const current = row?.v ?? 0;
  if (current < 2) {
    db.run('INSERT INTO schema_version(version, applied_at) VALUES(?, ?)', 2, Math.floor(Date.now() / 1000));
  }
  return current;
}

module.exports = { applyMigrations };
