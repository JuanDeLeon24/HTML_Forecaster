'use strict';
const config = require('../../config');
const { BaseProvider } = require('../BaseProvider');
const { RateLimitedClient } = require('../../lib/http');

const STATUS = { SCHEDULED: 'notstarted', TIMED: 'notstarted', IN_PLAY: 'inprogress', PAUSED: 'inprogress', FINISHED: 'finished', POSTPONED: 'postponed', CANCELLED: 'canceled', SUSPENDED: 'postponed' };

class FootballDataProvider extends BaseProvider {
  constructor({ baseUrl = config.footballData.baseUrl, apiKey = config.footballData.apiKey, http } = {}) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.http = http ?? new RateLimitedClient({ headers: { 'X-Auth-Token': apiKey || '' }, minIntervalMs: Math.max(config.http.minIntervalMs, config.footballData.minIntervalMs) });
  }
  get name() { return 'football-data'; }
  get requestCount() { return this.http.requestCount; }
  get(path) { return this.http.getJson(`${this.baseUrl}${path}`); }

  _mapTeam(t) { return { id: `football-data:team:${t.id}`, name: t.name, shortName: t.shortName ?? null, country: t.area?.name ?? null }; }
  _mapMatch(m) {
    const status = STATUS[m.status] ?? 'unknown';
    const finished = status === 'finished';
    return {
      id: `football-data:event:${m.id}`, provider: 'football-data', providerRef: String(m.id),
      tournament: m.competition ? { id: `football-data:comp:${m.competition.id}`, name: m.competition.name, category: m.competition.area?.name ?? null } : null,
      seasonId: m.season?.id ? `football-data:season:${m.season.id}` : null,
      round: m.matchday ? String(m.matchday) : null,
      startTime: Math.floor(new Date(m.utcDate).getTime() / 1000),
      status,
      home: this._mapTeam(m.homeTeam), away: this._mapTeam(m.awayTeam),
      homeGoals: finished ? (m.score?.fullTime?.home ?? null) : null,
      awayGoals: finished ? (m.score?.fullTime?.away ?? null) : null,
      homeGoalsHt: finished ? (m.score?.halfTime?.home ?? null) : null,
      awayGoalsHt: finished ? (m.score?.halfTime?.away ?? null) : null,
    };
  }

  async getScheduledMatches(date) {
    const out = [];
    const errors = [];
    // football-data usa sus propios IDs de competición (no los de Sofascore)
    for (const id of config.footballData.competitions) {
      try {
        const json = await this.get(`/competitions/${id}/matches?dateFrom=${date}&dateTo=${date}`);
        out.push(...(json?.matches ?? []).map((m) => this._mapMatch(m)));
      } catch (e) {
        errors.push(`${id}: ${e.message}`);
      }
    }
    // Si ninguna competición respondió, no es un día sin fútbol: es un fallo que debe
    // activar el respaldo o mostrarse al usuario (429, 403, red...).
    if (!out.length && errors.length) throw new Error(`Football-Data sin respuesta: ${errors[0]}`);
    // dedup by id
    const seen = new Set();
    return out.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  }
  async getTeamRecentMatches(teamId, limit) {
    const id = String(teamId).split(':').pop();
    const json = await this.get(`/teams/${id}/matches?status=FINISHED&limit=${limit}`);
    return (json?.matches ?? []).map((m) => this._mapMatch(m)).sort((a, b) => b.startTime - a.startTime);
  }
  async getMatch(matchId) {
    const id = String(matchId).split(':').pop();
    const json = await this.get(`/matches/${id}`);
    return json ? this._mapMatch(json) : null;
  }
  async getMatchStats() { return { available: false }; }
  async getMatchIncidents() { return []; }
  async getH2H() { return []; }
  async getStandings(tournamentId, seasonId) {
    const id = String(tournamentId).split(':').pop();
    const json = await this.get(`/competitions/${id}/standings`);
    const table = json?.standings?.[0]?.table ?? [];
    return table.map((r) => ({
      teamId: `football-data:team:${r.team.id}`, teamName: r.team.name, position: r.position, points: r.points, played: r.playedGames,
      wins: r.won, draws: r.draw, losses: r.lost, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst,
    }));
  }
  async getOdds() { return []; }
  defaultCompetitions() { return config.footballData.competitions.map((id) => `football-data:comp:${id}`); }
  /** Temporadas por año de inicio (las ligas europeas empiezan en julio/agosto). */
  async getRecentSeasons(_competitionId, count = 2) {
    const d = new Date();
    const start = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return Array.from({ length: count }, (_, i) => ({ id: String(start - i), name: `${start - i}/${start - i + 1}` }));
  }
  async getSeasonMatches(competitionId, seasonId) {
    if (String(competitionId).includes(':') && !String(competitionId).startsWith('football-data:')) {
      throw new Error(`Football-Data no puede cargar la competición ${competitionId} (ID de otro proveedor)`);
    }
    const id = String(competitionId).split(':').pop();
    const json = await this.get(`/competitions/${id}/matches?season=${seasonId}`);
    return (json?.matches ?? []).map((m) => this._mapMatch(m));
  }
  async getLineups() { return null; }
}

module.exports = { FootballDataProvider };
