'use strict';
/**
 * Proveedor con failover automático: intenta el proveedor principal y, si falla,
 * reintenta con el siguiente. Implementa BaseProvider.
 */
const { BaseProvider } = require('./BaseProvider');

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
      try { return await p[method](...args); } catch (err) { lastErr = err; }
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
}

module.exports = { FailoverProvider };
