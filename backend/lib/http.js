'use strict';
/**
 * Cliente HTTP con:
 *  - limitador de ritmo global (intervalo mínimo entre peticiones)
 *  - reintentos con backoff exponencial para 429 / 5xx / errores de red
 *  - timeout por petición
 * Devuelve null en 404 (recurso inexistente: NO se inventa nada).
 */
const config = require('../config');
const { createLogger, recordError, logApi } = require('./logger');

const log = createLogger('http');

class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} en ${url}`);
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

class RateLimitedClient {
  constructor({ minIntervalMs, retries, timeoutMs, headers = {} } = {}) {
    this.minIntervalMs = minIntervalMs ?? config.http.minIntervalMs;
    this.retries = retries ?? config.http.retries;
    this.timeoutMs = timeoutMs ?? config.http.timeoutMs;
    this.headers = headers;
    this.queue = Promise.resolve();
    this.last = 0;
    this.requestCount = 0;
  }

  /** Reserva un turno respetando el intervalo mínimo. */
  slot() {
    const turn = this.queue.then(async () => {
      const wait = this.last + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
    });
    this.queue = turn.catch(() => {});
    return turn;
  }

  async getJson(url) {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await this.slot();
      attempt += 1;
      this.requestCount += 1;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const t0 = Date.now();
        const res = await fetch(url, { headers: this.headers, signal: ctrl.signal });
        logApi({ url, status: res.status, ms: Date.now() - t0, attempt });
        if (res.status === 404) {
          log.debug('404 (sin datos)', { url });
          return null;
        }
        if (res.ok) return await res.json();
        const body = await res.text().catch(() => '');
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable || attempt > this.retries) {
          recordError({ source: safeHost(url), endpoint: url, error: `HTTP ${res.status}`, impact: 'dato no obtenido; el análisis continúa con los datos guardados' });
          throw new HttpError(res.status, url, body.slice(0, 300));
        }
        log.warn(`HTTP ${res.status}, reintento ${attempt}/${this.retries}`, { url });
      } catch (err) {
        if (err instanceof HttpError) throw err;
        if (attempt > this.retries) {
          recordError({ source: safeHost(url), endpoint: url, error: `${err.name}: ${err.message}`, impact: 'dato no obtenido; el análisis continúa con los datos guardados' });
          throw err;
        }
        log.warn(`Error de red (${err.name}: ${err.message}), reintento ${attempt}/${this.retries}`, { url });
      } finally {
        clearTimeout(timer);
      }
      await sleep(Math.min(30000, 1000 * 2 ** (attempt - 1)) + Math.random() * 300);
    }
  }
}

const safeHost = (u) => { try { return new URL(u).hostname; } catch { return 'desconocido'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { RateLimitedClient, HttpError, sleep };
