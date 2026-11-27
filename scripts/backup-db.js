'use strict';
/** Copia de seguridad manual: node scripts/backup-db.js  (restaurar: copiar el .db de storage/backups sobre data/forecaster.db) */
const { getDb } = require('../backend/database/db');
const { backupNow } = require('../backend/lib/backup');
console.log(backupNow(getDb().conn));
