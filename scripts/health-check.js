'use strict';
/** Comprueba integridad de la base, conteos y últimos errores: node scripts/health-check.js */
const fs = require('node:fs');
const path = require('node:path');
const { getDb } = require('../backend/database/db');
const { createRepositories } = require('../backend/database/repositories');
const db = getDb();
const repos = createRepositories(db);
const errors = path.resolve(__dirname, '../logs/errors.log');
console.log(JSON.stringify({
  integrity: db.conn.prepare('PRAGMA integrity_check').get(),
  counts: repos.counts(),
  lastRuns: repos.lastRuns(3),
  recentErrors: fs.existsSync(errors) ? fs.readFileSync(errors, 'utf8').trim().split('\n').slice(-5).map((l) => JSON.parse(l)) : [],
}, null, 2));
