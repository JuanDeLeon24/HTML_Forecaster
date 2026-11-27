'use strict';
/**
 * Migraciones incrementales e idempotentes (bases creadas con versiones anteriores,
 * incluida la base guardada en el navegador por la versión de archivo único).
 */
const COLUMNS = [
  ['predictions', 'calibrated', 'INTEGER NOT NULL DEFAULT 0'],
  ['predictions', 'raw_probability', 'REAL'],
  ['predictions', 'confidence_score', 'REAL'],
];

function migrate(db) {
  for (const [table, col, def] of COLUMNS) {
    const cols = db.all(`PRAGMA table_info(${table})`).map((c) => c.name);
    if (cols.length && !cols.includes(col)) db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
}

module.exports = { migrate };
