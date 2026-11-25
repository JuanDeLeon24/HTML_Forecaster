'use strict';
/**
 * Cliente HTTP que responde desde un archivo descargado con el recolector de sofascore.com.
 * Mismas rutas que el cliente real → el proveedor, el mapper y todo el pipeline se reutilizan.
 * Una ruta ausente lanza error (no se interpreta como «sin datos», para no guardar vacíos falsos),
 * salvo páginas extra de histórico y /event/{id}, que se reconstruye desde otros listados.
 */
class CachedHttpClient {
  constructor(file, baseUrl) {
    if (!file || file.format !== 'hf-sofascore-cache' || !file.responses) throw new Error('El archivo no es una descarga de HTML_Forecaster (sofascore_AAAA-MM-DD.json).');
    this.responses = file.responses;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.requestCount = 0;
    this.events = new Map();
    for (const body of Object.values(this.responses)) for (const e of body?.events ?? []) this.events.set(String(e.id), e);
  }

  async getJson(url) {
    this.requestCount += 1;
    const path = url.startsWith(this.baseUrl) ? url.slice(this.baseUrl.length) : url.replace(/^https?:\/\/[^/]+\/api\/v1/, '');
    if (path in this.responses) return this.responses[path];
    if (/\/events\/last\/[1-9]$/.test(path)) return null;
    const m = path.match(/^\/event\/(\d+)$/);
    if (m && this.events.has(m[1])) return { event: this.events.get(m[1]) };
    const err = new Error(`No incluido en el archivo importado: ${path}`);
    err.notInCache = true;
    throw err;
  }
}

module.exports = { CachedHttpClient };
