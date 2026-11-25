'use strict';
/**
 * Acceso a SQLite mediante el módulo nativo node:sqlite (sin compilación nativa).
 * Para producción se recomienda PostgreSQL: el esquema evita tipos exóticos y
 * todo el SQL vive en repositories.js para facilitar la migración.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');
const { createLogger } = require('../lib/logger');

const log = createLogger('db');

class Database {
  constructor(file = config.dbPath) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.file = file;
    this.conn = new DatabaseSync(file);
    this.conn.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.conn.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    this.cache = new Map();
    log.debug('Base de datos abierta', { file });
  }

  stmt(sql) {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.conn.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  all(sql, ...params) { return this.stmt(sql).all(...params).map(plain); }
  get(sql, ...params) { const r = this.stmt(sql).get(...params); return r ? plain(r) : null; }
  run(sql, ...params) { return this.stmt(sql).run(...params); }

  /** Ejecuta fn dentro de una transacción (rollback si lanza). */
  tx(fn) {
    this.conn.exec('BEGIN');
    try {
      const r = fn();
      this.conn.exec('COMMIT');
      return r;
    } catch (e) {
      this.conn.exec('ROLLBACK');
      throw e;
    }
  }

  close() { this.conn.close(); }
}

const plain = (row) => ({ ...row });

let instance = null;
function getDb() {
  if (!instance) instance = new Database();
  return instance;
}
function setDb(db) { instance = db; }

module.exports = { Database, getDb, setDb };
