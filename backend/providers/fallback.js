'use strict';
/**
 * Proveedor con failover automático: intenta el proveedor principal y, si falla,
 * reintenta con el siguiente. Implementa BaseProvider.
 * Nota: los IDs son por proveedor; un partido obtenido del respaldo es un registro distinto
 * (no se mezclan identificadores de fuentes diferentes).
 */
const { BaseProvider } = require('./BaseProvider');
const { createLogger } = require('../lib/logger');

const log = createLogger('failover');

class FailoverProvider extends BaseProvider {
  constructor(providers) {
    super();
    this.providers = providers.filter(Boolean);
    if (!this.providers.length) throw new Error('FailoverProvider requiere al menos un proveedor');
  }
  get name() { return `failover(${this.providers.map((p) => p.name).join('->')})`; }
  get requestCount() { return this.providers.reduce((s, p) => s + (p.requestCount || 0), 0); }

  async _try(method, args) {
    let lastErr;
    for (const p of this.providers) {
      try { return await p[method](...args); } catch (err) {
        lastErr = err;
        log.warn(`Proveedor ${p.name} falló en ${method}; se intenta el siguiente`, { error: err.message });
      }
    }
    throw lastErr;
  }

  async getScheduledMatches(...a) { return this._try('getScheduledMatches', a); }
  async getTeamRecentMatches(...a) { return this._try('getTeamRecentMatches', a); }
  async getMatch(...a) { return this._try('getMatch', a); }
  async getMatchStats(...a) { return this._try('getMatchStats', a); }
  async getMatchIncidents(...a) { return this._try('getMatchIncidents', a); }
  async getH2H(...a) { return this._try('getH2H', a); }
  async getStandings(...a) { return this._try('getStandings', a); }
  async getOdds(...a) { return this._try('getOdds', a); }
  async getLineups(...a) { return this._try('getLineups', a); }
  defaultCompetitions() { return this.providers[0].defaultCompetitions(); }
  async getRecentSeasons(...a) { return this.providers[0].getRecentSeasons(...a); }
  async getSeasonMatches(...a) { return this.providers[0].getSeasonMatches(...a); }
}

module.exports = { FailoverProvider };
