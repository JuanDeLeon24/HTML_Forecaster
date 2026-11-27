'use strict';
/**
 * Proveedor Sofascore (API JSON no oficial usada por su web; mismos endpoints que
 * envuelve https://github.com/apdmatos/sofascore-api). No hay garantía de
 * estabilidad: si cambia un endpoint, solo hay que tocar este archivo y mapper.js.
 * Úsese con fines personales/educativos y respetando un ritmo de peticiones bajo.
 */
const config = require('../../config');
const { BaseProvider } = require('../BaseProvider');
const { RateLimitedClient } = require('../../lib/http');
const { shiftDate } = require('../../lib/dates');
const map = require('./mapper');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  Referer: 'https://www.sofascore.com/',
  Origin: 'https://www.sofascore.com',
  'Cache-Control': 'no-cache',
};

class SofascoreProvider extends BaseProvider {
  constructor({ baseUrl = config.sofascore.baseUrl, http } = {}) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.http = http ?? new RateLimitedClient({ headers: HEADERS });
  }

  get name() { return 'sofascore'; }
  get requestCount() { return this.http.requestCount; }

  get(path) { return this.http.getJson(`${this.baseUrl}${path}`); }

  /** Pide el día y sus vecinos para cubrir el desfase de zona horaria. */
  async getScheduledMatches(date) {
    const out = new Map();
    for (const d of [shiftDate(date, -1), date, shiftDate(date, 1)]) {
      const json = await this.get(`/sport/football/scheduled-events/${d}`);
      for (const e of json?.events ?? []) out.set(e.id, map.mapEvent(e));
    }
    return [...out.values()];
  }

  async getTeamRecentMatches(teamId, limit) {
    const id = map.ids.native(teamId);
    const events = [];
    for (let page = 0; page < 5 && events.length < limit + 5; page++) {
      const json = await this.get(`/team/${id}/events/last/${page}`);
      if (!json?.events?.length) break;
      events.push(...json.events);
      if (!json.hasNextPage) break;
    }
    return events.map(map.mapEvent).sort((a, b) => b.startTime - a.startTime);
  }

  async getMatch(matchId) {
    const json = await this.get(`/event/${map.ids.native(matchId)}`);
    return json?.event ? map.mapEvent(json.event) : null;
  }

  async getMatchStats(matchId) {
    const json = await this.get(`/event/${map.ids.native(matchId)}/statistics`);
    return json ? map.mapStatistics(json) : { available: false };
  }

  async getMatchIncidents(matchId) {
    const json = await this.get(`/event/${map.ids.native(matchId)}/incidents`);
    return json ? map.mapIncidents(json) : [];
  }

  async getH2H(match) {
    if (!match.providerRef) return [];
    const json = await this.get(`/event/${match.providerRef}/h2h/events`);
    return (json?.events ?? []).map(map.mapEvent).filter((m) => m.id !== match.id);
  }

  async getStandings(tournamentId, seasonId) {
    if (!tournamentId?.includes(':ut:') || !seasonId) return [];
    const json = await this.get(`/unique-tournament/${map.ids.native(tournamentId)}/season/${map.ids.native(seasonId)}/standings/total`);
    return json ? map.mapStandings(json) : [];
  }

  async getOdds(matchId) {
    const json = await this.get(`/event/${map.ids.native(matchId)}/odds/1/all`);
    return json ? map.mapOdds(json) : [];
  }

  async getLineups(matchId) {
    const json = await this.get(`/event/${map.ids.native(matchId)}/lineups`);
    return json ? map.mapLineups(json) : null;
  }
}

module.exports = { SofascoreProvider };
