'use strict';
/**
 * Proveedor SINTÉTICO solo para tests (nunca se registra en la app).
 * Genera una liga ficticia con fuerzas conocidas y resultados Poisson con semilla fija,
 * para verificar el pipeline completo sin red.
 */
const { BaseProvider } = require('../../backend/providers/BaseProvider');

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
function poisson(r, lambda) {
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}

class FakeProvider extends BaseProvider {
  constructor({ teams = 12, seed = 42, scheduledDate, now = Math.floor(Date.now() / 1000) } = {}) {
    super();
    this.r = rng(seed);
    this.count = 0;
    this.teams = Array.from({ length: teams }, (_, i) => ({ id: `fake:team:${i}`, name: `Team ${String.fromCharCode(65 + i)}`, atk: 0.7 + this.r() * 0.8, def: 0.7 + this.r() * 0.8 }));
    this.matches = [];
    this.stats = new Map();
    this.incidents = new Map();
    const tour = { id: 'fake:ut:1', name: 'Liga Sintética', category: 'Test' };
    let t = now - 200 * 86400;
    let id = 1;
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < teams; i++) for (let j = 0; j < teams; j++) {
        if (i === j) continue;
        const h = this.teams[i], a = this.teams[j];
        const hg = poisson(this.r, 1.45 * h.atk * a.def), ag = poisson(this.r, 1.15 * a.atk * h.def);
        const m = { id: `fake:event:${seed}-${id++}`, provider: 'fake', providerRef: null, tournament: tour, seasonId: 'fake:season:1', round: String(round),
          startTime: t, status: 'finished', home: { id: h.id, name: h.name }, away: { id: a.id, name: a.name }, homeGoals: hg, awayGoals: ag };
        t += 3600 * 11;
        this.matches.push(m);
        this.stats.set(m.id, { available: true, homeCorners: poisson(this.r, 5.4), awayCorners: poisson(this.r, 4.4), homeYellow: poisson(this.r, 1.9), awayYellow: poisson(this.r, 2.2), homeRed: 0, awayRed: this.r() < 0.1 ? 1 : 0, homeXg: hg * 0.8 + 0.3, awayXg: ag * 0.8 + 0.2 });
        this.incidents.set(m.id, []);
      }
    }
    // Partidos programados (futuros) para scheduledDate a las 18:00Z
    const base = Math.floor(Date.parse(`${scheduledDate}T18:00:00Z`) / 1000);
    for (let i = 0; i < teams; i += 2) {
      const h = this.teams[i], a = this.teams[i + 1];
      this.matches.push({ id: `fake:event:${seed}-${id++}`, provider: 'fake', providerRef: null, tournament: tour, seasonId: 'fake:season:1', round: 'next',
        startTime: base + i * 600, status: 'notstarted', home: { id: h.id, name: h.name }, away: { id: a.id, name: a.name }, homeGoals: null, awayGoals: null });
    }
  }
  get name() { return 'fake'; }
  get requestCount() { return this.count; }
  async getScheduledMatches() { this.count++; return this.matches.filter((m) => m.status === 'notstarted').map((m) => ({ ...m })); }
  async getTeamRecentMatches(teamId, limit) {
    this.count++;
    return this.matches.filter((m) => m.home.id === teamId || m.away.id === teamId).sort((a, b) => b.startTime - a.startTime).slice(0, limit + 2).map((m) => ({ ...m }));
  }
  async getMatch(id) { this.count++; const m = this.matches.find((x) => x.id === id); return m ? { ...m } : null; }
  async getMatchStats(id) { this.count++; return this.stats.get(id) ?? { available: false }; }
  async getMatchIncidents(id) { this.count++; return this.incidents.get(id) ?? []; }
  async getH2H(match) {
    this.count++;
    return this.matches.filter((m) => m.status === 'finished' && ((m.home.id === match.home.id && m.away.id === match.away.id) || (m.home.id === match.away.id && m.away.id === match.home.id)));
  }
  async getStandings() { this.count++; return []; }
  async getOdds(id) {
    this.count++;
    return [{ market: '1X2', selection: '1', line: 0, decimalOdds: 2.1 }, { market: '1X2', selection: 'X', line: 0, decimalOdds: 3.4 }, { market: '1X2', selection: '2', line: 0, decimalOdds: 3.6 },
      { market: 'OU', selection: 'over', line: 2.5, decimalOdds: 1.95 }, { market: 'OU', selection: 'under', line: 2.5, decimalOdds: 1.9 }].map((o) => ({ ...o, matchId: id }));
  }
  /** Simula que los partidos programados terminan. */
  finishScheduled() {
    for (const m of this.matches.filter((x) => x.status === 'notstarted')) {
      m.status = 'finished'; m.homeGoals = poisson(this.r, 1.4); m.awayGoals = poisson(this.r, 1.1);
      this.stats.set(m.id, { available: true, homeCorners: 6, awayCorners: 4, homeYellow: 2, awayYellow: 3, homeRed: 0, awayRed: 1, homeXg: 2.9, awayXg: 0.4 });
      this.incidents.set(m.id, [{ type: 'red_card', minute: 15, side: 'away', player: 'Jugador X' }]);
    }
  }
}

module.exports = { FakeProvider };
