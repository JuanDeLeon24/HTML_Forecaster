'use strict';
/**
 * Punto de entrada de la versión de ARCHIVO ÚNICO (HTML_Forecaster.html).
 * Ejecuta en el navegador exactamente el mismo motor que el servidor:
 * proveedor Sofascore, recolectores, modelos, validación, aprendizaje y manejadores de la API.
 * La base de datos SQLite (sql.js/WebAssembly) se guarda en IndexedDB del navegador.
 */
const initSqlJs = require('sql.js/dist/sql-wasm.js');
const config = require('./config');
const { BrowserDatabase, idbGet } = require('./db');
const { logBuffer } = require('./logger');
const { createRepositories } = require('../backend/database/repositories');
const services = require('../backend/services');
const { setProvider } = require('../backend/providers');
const { SofascoreProvider } = require('../backend/providers/sofascore/client');
const { RateLimitedClient } = require('../backend/lib/http');
const { dispatch } = require('../backend/routes/handlers');

let db = null;
let storageOk = true;

function makeProvider() {
  // En el navegador no se pueden enviar User-Agent/Referer y cualquier cabecera no estándar
  // provocaría una verificación CORS previa: solo se envía Accept.
  const http = new RateLimitedClient({ headers: { Accept: 'application/json' } });
  return new SofascoreProvider({ baseUrl: config.sofascore.baseUrl, http });
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function persist() {
  if (!db || !storageOk) return;
  try { await db.persist(); } catch (e) { storageOk = false; console.warn('No se pudo guardar en el navegador', e); }
}

const NET_HINT = 'El navegador no pudo conectar con Sofascore. Causas probables: (1) la red de la empresa bloquea sofascore.com; '
  + '(2) Sofascore rechaza peticiones desde un archivo local (CORS). Usa «Abrir en pestaña nueva» en «Datos y ajustes»: '
  + 'si ves datos JSON, la red funciona y el bloqueo es CORS.';

async function transport(method, path, body) {
  const url = new URL(path, 'http://local');
  const query = Object.fromEntries(url.searchParams.entries());
  const r = await dispatch(method, url.pathname, query, body);
  if (r.body && r.body.job && r.body.job.error) r.body.job.error = withHint(r.body.job.error);
  if (url.pathname.startsWith('/jobs/') && r.body?.error && r.body.status === 'error') r.body.error = withHint(r.body.error);
  if (method === 'POST' || (url.pathname.startsWith('/jobs/') && r.body?.status !== 'running')) await persist();
  return r;
}

function withHint(msg) {
  return /fetch|network|load failed|cors/i.test(msg) && !msg.includes('Sofascore') ? `${msg}. ${NET_HINT}` : msg;
}

async function boot() {
  const status = document.getElementById('boot');
  try {
    const SQL = await initSqlJs({ wasmBinary: base64ToBytes(window.__SQL_WASM__).buffer });
    let bytes = null;
    try { bytes = await idbGet(); } catch (e) { storageOk = false; console.warn('IndexedDB no disponible', e); }
    db = new BrowserDatabase(SQL, bytes);
    services.setRepos(createRepositories(db));
    setProvider(makeProvider());
    setInterval(persist, 5000);
    window.addEventListener('pagehide', () => { persist(); });
  } catch (e) {
    status.innerHTML = `No se pudo iniciar el motor: ${e.message}`;
    throw e;
  }
  status.remove();

  const HF = window.HF;
  HF.transport = transport;
  HF.standalone = {
    config, logBuffer, NET_HINT,
    storageOk: () => storageOk,
    saveSettings(next) { const s = config.saveSettings(next); setProvider(makeProvider()); return s; },
    async testConnection() {
      const t0 = Date.now();
      const url = `${config.sofascore.baseUrl}/sport/football/scheduled-events/${HF.today()}`;
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const ms = Date.now() - t0;
        if (!res.ok) return { ok: false, url, message: `Sofascore respondió HTTP ${res.status} (${ms} ms). Si es 403, está bloqueando peticiones automatizadas.` };
        const j = await res.json();
        return { ok: true, url, message: `Conexión correcta: ${j.events?.length ?? 0} partidos recibidos para hoy (${ms} ms).` };
      } catch (e) {
        return { ok: false, url, message: `${e.message}. ${NET_HINT}` };
      }
    },
    exportDb() {
      const bytes = db.export();
      const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `html_forecaster_${HF.today()}.sqlite`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    async importDb(file) {
      const buf = new Uint8Array(await file.arrayBuffer());
      const SQL = db.SQL;
      const next = new BrowserDatabase(SQL, buf);
      db.close();
      db = next;
      db.dirty = true;
      services.setRepos(createRepositories(db));
      await persist();
    },
    async resetDb() {
      const SQL = db.SQL;
      db.close();
      db = new BrowserDatabase(SQL, null);
      db.dirty = true;
      services.setRepos(createRepositories(db));
      await persist();
    },
  };

  HF.header();
  const tools = document.getElementById('hf-tools');
  tools.innerHTML = `<a class="btn btn-ghost" href="#/settings" title="Datos y ajustes">Datos y ajustes</a>`;
  const route = () => {
    const page = location.hash.replace(/^#\/?/, '').split('?')[0] || 'index';
    HF.mount(page);
  };
  window.addEventListener('hashchange', route);
  route();
}

boot();
