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
    this.http = http ?? new RateLimitedClient({ headers: { 'X-Auth-Token': apiKey || '' } });
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
    const cfgTournaments = require('../../config').collection.tournaments || [];
    const ids = cfgTournaments.length ? cfgTournaments : [2021, 2016, 2014, 2002, 2019, 2015, 2001];
    for (const id of ids) {
      try {
        const json = await this.get(`/competitions/${id}/matches?dateFrom=${date}&dateTo=${date}`);
        out.push(...(json?.matches ?? []).map((m) => this._mapMatch(m)));
      } catch (e) {
        // ignore competition errors
      }
    }
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
  async getLineups() { return null; }
}

module.exports = { FootballDataProvider };
