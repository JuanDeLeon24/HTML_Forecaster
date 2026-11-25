'use strict';
/**
 * Adaptador SQLite para navegador (sql.js / WebAssembly) con la misma interfaz que
 * backend/database/db.js → database/repositories.js se reutiliza sin cambios.
 * Persistencia: el archivo SQLite completo se guarda en IndexedDB del navegador.
 */
const schema = require('../backend/database/schema.sql');

const IDB_NAME = 'html_forecaster';
const IDB_STORE = 'db';
const IDB_KEY = 'sqlite';

function idb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('IndexedDB no disponible'));
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet() {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

async function idbPut(bytes) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

class BrowserDatabase {
  constructor(SQL, bytes) {
    this.SQL = SQL;
    this.conn = bytes ? new SQL.Database(bytes) : new SQL.Database();
    this.conn.exec('PRAGMA foreign_keys = ON;');
    this.conn.exec(schema);
    this.cache = new Map();
    this.dirty = false;
    this.inTx = false;
  }

  stmt(sql) {
    let s = this.cache.get(sql);
    if (!s) { s = this.conn.prepare(sql); this.cache.set(sql, s); }
    return s;
  }

  all(sql, ...params) {
    const s = this.stmt(sql);
    s.bind(params.map(norm));
    const rows = [];
    while (s.step()) rows.push(s.getAsObject());
    s.reset();
    return rows;
  }

  get(sql, ...params) { return this.all(sql, ...params)[0] ?? null; }

  run(sql, ...params) {
    const s = this.stmt(sql);
    s.run(params.map(norm));
    this.dirty = true;
    const changes = this.conn.getRowsModified();
    const id = this.conn.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0;
    return { changes, lastInsertRowid: id };
  }

  tx(fn) {
    if (this.inTx) return fn();
    this.conn.exec('BEGIN');
    this.inTx = true;
    try {
      const r = fn();
      this.conn.exec('COMMIT');
      return r;
    } catch (e) {
      this.conn.exec('ROLLBACK');
      throw e;
    } finally {
      this.inTx = false;
    }
  }

  export() {
    for (const s of this.cache.values()) s.free();
    this.cache.clear();
    return this.conn.export();
  }

  async persist() {
    if (!this.dirty) return false;
    this.dirty = false;
    await idbPut(this.export());
    return true;
  }

  close() { this.conn.close(); }
}

// sql.js no acepta undefined ni booleanos
const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

module.exports = { BrowserDatabase, idbGet, idbPut };
