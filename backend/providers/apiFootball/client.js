'use strict';
const config = require('../../config');
const { BaseProvider } = require('../BaseProvider');
const { RateLimitedClient } = require('../../lib/http');

const STATUS = { NS: 'notstarted', '1H': 'inprogress', HT: 'inprogress', '2H': 'inprogress', ET: 'inprogress', BT: 'inprogress', P: 'inprogress', SUSP: 'postponed', INT: 'postponed', FT: 'finished', AET: 'finished', PEN: 'finished', PST: 'postponed', CANC: 'canceled', ABD: 'canceled', AWD: 'finished', WO: 'finished', TBD: 'notstarted' };

class ApiFootballProvider extends BaseProvider {
  constructor({ baseUrl = config.apiFootball.baseUrl, apiKey = config.apiFootball.apiKey, http } = {}) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.http = http ?? new RateLimitedClient({ headers: { 'x-apisports-key': apiKey || '' } });
  }
  get name() { return 'api-football'; }
  get requestCount() { return this.http.requestCount; }
  get(path) { return this.http.getJson(`${this.baseUrl}${path}`); }

  _mapTeam(t) { return { id: `api-football:team:${t.id}`, name: t.name, shortName: t.code ?? null, country: t.country ?? null }; }
  _mapFixture(f) {
    const status = STATUS[f.fixture?.status?.short] ?? 'unknown';
    const finished = status === 'finished';
    return {
      id: `api-football:event:${f.fixture.id}`, provider: 'api-football', providerRef: String(f.fixture.id),
      tournament: f.league ? { id: `api-football:comp:${f.league.id}`, name: f.league.name, category: f.league.country ?? null } : null,
      seasonId: f.league?.season ? `api-football:season:${f.league.season}` : null,
      round: f.league?.round ?? null,
      startTime: f.fixture.timestamp,
      status,
      home: this._mapTeam(f.teams.home), away: this._mapTeam(f.teams.away),
      homeGoals: finished ? (f.goals?.home ?? null) : null,
      awayGoals: finished ? (f.goals?.away ?? null) : null,
      homeGoalsHt: finished && f.score?.halftime?.home !== null ? f.score.halftime.home : null,
      awayGoalsHt: finished && f.score?.halftime?.away !== null ? f.score.halftime.away : null,
      referee: f.fixture?.referee ?? null,
    };
  }

  async getScheduledMatches(date) {
    const json = await this.get(`/fixtures?date=${date}`);
    return (json?.response ?? []).map((f) => this._mapFixture(f));
  }
  async getTeamRecentMatches(teamId, limit) {
    const id = String(teamId).split(':').pop();
    const json = await this.get(`/fixtures?team=${id}&last=${limit}`);
    return (json?.response ?? []).map((f) => this._mapFixture(f)).sort((a, b) => b.startTime - a.startTime);
  }
  async getMatch(matchId) {
    const id = String(matchId).split(':').pop();
    const json = await this.get(`/fixtures?id=${id}`);
    return json?.response?.[0] ? this._mapFixture(json.response[0]) : null;
  }
  async getMatchStats(matchId) {
    const id = String(matchId).split(':').pop();
    const json = await this.get(`/fixtures/statistics?fixture=${id}`);
    const arr = json?.response ?? [];
    if (!arr.length) return { available: false };
    const home = arr[0]?.statistics ?? [];
    const away = arr[1]?.statistics ?? [];
    const get = (stats, type) => {
      const it = stats.find((s) => String(s.type).toLowerCase() === type);
      const v = it?.value;
      if (v === null || v === undefined) return null;
      const n = typeof v === 'string' ? parseFloat(v.replace('%', '')) : v;
      return Number.isFinite(n) ? n : null;
    };
    const out = {
      available: true,
      homeShots: get(home, 'total shots'), awayShots: get(away, 'total shots'),
      homeSot: get(home, 'shots on goal'), awaySot: get(away, 'shots on goal'),
      homePossession: get(home, 'ball possession'), awayPossession: get(away, 'ball possession'),
      homeCorners: get(home, 'corner kicks'), awayCorners: get(away, 'corner kicks'),
      homeFouls: get(home, 'fouls'), awayFouls: get(away, 'fouls'),
      homeYellow: get(home, 'yellow cards'), awayYellow: get(away, 'yellow cards'),
      homeRed: get(home, 'red cards'), awayRed: get(away, 'red cards'),
      homeXg: get(home, 'expected goals'), awayXg: get(away, 'expected goals'),
    };
    if (out.homeCorners === null && out.homeYellow === null) out.available = false;
    // red cards ausentes = 0
    if (out.homeYellow !== null && out.homeRed === null) { out.homeRed = 0; out.awayRed = 0; }
    return out;
  }
  async getMatchIncidents(matchId) {
    const id = String(matchId).split(':').pop();
    const json = await this.get(`/fixtures/events?fixture=${id}`);
    const out = [];
    for (const e of json?.response ?? []) {
      const side = e.team?.id ? (e.team.id === (json.response[0]?.team?.id) ? 'home' : 'away') : null;
      // better: compare with fixture? We'll infer by team id later; here use home/away by first event's team? fallback: check fixture
      const minute = e.time?.elapsed ?? null;
      if (e.type === 'Goal') out.push({ type: 'goal', minute, side: null, player: e.player?.name ?? null, detail: e.detail ?? null });
      else if (e.type === 'Card') {
        const red = /red/i.test(e.detail || '');
        out.push({ type: red ? 'red_card' : 'yellow_card', minute, side: null, player: e.player?.name ?? null, detail: e.detail ?? null });
      } else if (e.type === 'Penalty' && !/scored/i.test(e.detail || '')) {
        out.push({ type: 'penalty_miss', minute, side: null, player: e.player?.name ?? null, detail: e.detail ?? null });
      }
    }
    // Fix sides by fetching fixture
    try {
      const fx = await this.get(`/fixtures?id=${id}`);
      const f = fx?.response?.[0];
      const homeId = f?.teams?.home?.id;
      for (const e of json?.response ?? []) {
        // re-map side based on team id
      }
      // Rebuild with correct sides
      const out2 = [];
      for (const e of json?.response ?? []) {
        const side = e.team?.id === homeId ? 'home' : 'away';
        const minute = e.time?.elapsed ?? null;
        if (e.type === 'Goal') out2.push({ type: 'goal', minute, side, player: e.player?.name ?? null, detail: e.detail ?? null });
        else if (e.type === 'Card') {
          const red = /red/i.test(e.detail || '');
          out2.push({ type: red ? 'red_card' : 'yellow_card', minute, side, player: e.player?.name ?? null, detail: e.detail ?? null });
        } else if (e.type === 'Penalty' && !/scored/i.test(e.detail || '')) {
          out2.push({ type: 'penalty_miss', minute, side, player: e.player?.name ?? null, detail: e.detail ?? null });
        }
      }
      return out2;
    } catch (e) {
      return out;
    }
  }
  async getH2H(match) {
    // match has home/away with ids
    const h = String(match.home.id).split(':').pop();
    const a = String(match.away.id).split(':').pop();
    const json = await this.get(`/fixtures/headtohead?h2h=${h}-${a}`);
    return (json?.response ?? []).map((f) => this._mapFixture(f)).filter((m) => m.id !== match.id);
  }
  async getStandings(tournamentId, seasonId) {
    const leagueId = String(tournamentId).split(':').pop();
    const season = seasonId ? String(seasonId).split(':').pop() : new Date().getFullYear();
    const json = await this.get(`/standings?league=${leagueId}&season=${season}`);
    const table = json?.response?.[0]?.league?.standings?.[0] ?? [];
    return table.map((r) => ({
      teamId: `api-football:team:${r.team.id}`, teamName: r.team.name, position: r.rank, points: r.points, played: r.all.played,
      wins: r.all.win, draws: r.all.draw, losses: r.all.lose, goalsFor: r.all.goals.for, goalsAgainst: r.all.goals.against,
    }));
  }
  async getOdds(matchId) {
    const id = String(matchId).split(':').pop();
    const json = await this.get(`/odds?fixture=${id}`);
    const out = [];
    for (const b of json?.response ?? []) {
      for (const bk of b.bookmakers ?? []) {
        for (const bet of bk.bets ?? []) {
          const name = String(bet.name).toLowerCase();
          for (const v of bet.values ?? []) {
            const odd = parseFloat(v.odd);
            if (!Number.isFinite(odd) || odd <= 1) continue;
            if (name.includes('match winner')) {
              const sel = v.value === 'Home' ? '1' : v.value === 'Draw' ? 'X' : v.value === 'Away' ? '2' : null;
              if (sel) out.push({ market: '1X2', selection: sel, line: 0, decimalOdds: odd, source: 'api-football' });
            } else if (name.includes('goals over/under')) {
              const m = String(v.value).match(/(Over|Under)\s+([\d.]+)/i);
              if (m) out.push({ market: 'OU', selection: m[1].toLowerCase() === 'over' ? 'over' : 'under', line: parseFloat(m[2]), decimalOdds: odd, source: 'api-football' });
            } else if (name.includes('both teams score')) {
              const sel = /yes/i.test(v.value) ? 'yes' : 'no';
              out.push({ market: 'BTTS', selection: sel, line: 0, decimalOdds: odd, source: 'api-football' });
            } else if (name.includes('double chance')) {
              const sel = String(v.value).replace(/\s/g, '').toUpperCase();
              out.push({ market: 'DC', selection: sel, line: 0, decimalOdds: odd, source: 'api-football' });
            }
          }
        }
      }
    }
    // dedup by market/selection/line keep first
    const seen = new Set();
    return out.filter((o) => (seen.has(`${o.market}|${o.selection}|${o.line}`) ? false : (seen.add(`${o.market}|${o.selection}|${o.line}`), true)));
  }
  async getLineups(matchId) {
    const id = String(matchId).split(':').pop();
    const json = await this.get(`/fixtures/lineups?fixture=${id}`);
    const arr = json?.response ?? [];
    if (!arr.length) return null;
    const mapSide = (side) => (side?.startXI ?? []).map((p) => ({ player: p.player?.name ?? null, position: p.player?.pos ?? null, isStarter: true }))
      .concat((side?.substitutes ?? []).map((p) => ({ player: p.player?.name ?? null, position: p.player?.pos ?? null, isStarter: false })));
    return { home: mapSide(arr[0]), away: mapSide(arr[1]) };
  }
}

module.exports = { ApiFootballProvider };
