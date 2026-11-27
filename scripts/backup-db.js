'use strict';
const fs = require('node:fs');
const path = require('node:path');
const src = path.resolve(process.argv[2] || './data/forecaster.db');
const dir = path.resolve('./storage/backups');
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
fs.copyFileSync(src, out);
console.log('Backup creado:', out);