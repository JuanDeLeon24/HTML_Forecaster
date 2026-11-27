'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { FootballDataProvider } = require('../backend/providers/footballData/client');
const { ApiFootballProvider } = require('../backend/providers/apiFootball/client');
const { FailoverProvider } = require('../backend/providers/fallback');
const { BaseProvider } = require('../backend/providers/BaseProvider');
const { runBootstrap } = require('../backend/collectors/bootstrap');
const { allowedFor } = require('../backend/collectors/fixtures');
const { Database } = require('../backend/database/db');
const { createRepositories } = require('../backend/database/repositories');
const { primaryRows, roi, bootstrapCI, fullReport } = require('../backend/validation/metrics');
const { impliedNoVig } = require('../backend/analyzers/valuebets');
const { analyzeLive, overProb } = require('../backend/engine/live');
const { buildTopMessage } = require('../backend/lib/whatsapp');
const { fitRho } = require('../backend/models/poisson');
const config = require('../backend/config');

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const fakeHttp = (routes) => ({ requestCount: 0, async getJson(url) { this.requestCount++; const k = Object.keys(routes).find((r) => url.includes(r)); if (!k) throw new Error(`sin ruta ${url}`); return routes[k]; } });
const fdMatch = (id, status, utc, h, a, gh, ga) => ({ id, status, utcDate: utc, matchday: 1, competition: { id: 2021, name: 'Premier League', area: { name: 'England' } }, season: { id: 9 },
  homeTeam: { id: h, name: `T${h}` }, awayTeam: { id: a, name: `T${a}` }, score: { fullTime: { home: gh, away: ga }, halfTime: { home: 0, away: 0 } } });

test('football-data: mapeo, temporadas por año de inicio y temporada completa', async () => {
  const p = new FootballDataProvider({ apiKey: 'x', http: fakeHttp({ '/competitions/2021/matches?season=': { matches: [fdMatch(1, 'FINISHED', '2026-10-01T15:00:00Z', 10, 11, 2, 1), fdMatch(2, 'TIMED', '2026-12-01T15:00:00Z', 11, 10, null, null)] } }) });
  const seasons = await p.getRecentSeasons('football-data:comp:2021', 2);
  assert.equal(seasons.length, 2);
  assert.equal(Number(seasons[0].id) - Number(seasons[1].id), 1);
  const ms = await p.getSeasonMatches('football-data:comp:2021', seasons[0].id);
  assert.equal(ms[0].id, 'football-data:event:1');
  assert.equal(ms[0].status, 'finished');
  assert.equal(ms[0].homeGoals, 2);
  assert.equal(ms[1].homeGoals, null, 'sin marcador si no ha terminado');
  assert.deepEqual(p.defaultCompetitions(), config.footballData.competitions.map((id) => `football-data:comp:${id}`));
});

test('filtro de competiciones por proveedor: football-data no usa los IDs de Sofascore', () => {
  assert.deepEqual(allowedFor('football-data'), config.footballData.competitions);
  assert.deepEqual(allowedFor('api-football'), config.apiFootball.leagues);
  assert.deepEqual(allowedFor('sofascore'), config.collection.tournaments);
  assert.deepEqual(allowedFor('sofascore', [1]), [1]);
});

test('API-Football: incidencias con lado correcto SIN repetir la petición del partido', async () => {
  const http = fakeHttp({ '/fixtures/events': { response: [
    { type: 'Goal', detail: 'Normal Goal', time: { elapsed: 10 }, team: { id: 5 }, player: { name: 'A' } },
    { type: 'Card', detail: 'Red Card', time: { elapsed: 30 }, team: { id: 6 }, player: { name: 'B' } },
  ] } });
  const p = new ApiFootballProvider({ apiKey: 'x', http });
  const inc = await p.getMatchIncidents('api-football:event:1', { home: { id: 'api-football:team:5' } });
  assert.equal(http.requestCount, 1);
  assert.equal(inc[0].side, 'home');
  assert.equal(inc[1].type, 'red_card');
  assert.equal(inc[1].side, 'away');
});

test('failover: si el principal falla se usa el respaldo', async () => {
  class Bad extends BaseProvider { get name() { return 'bad'; } async getScheduledMatches() { throw new Error('HTTP 403'); } }
  class Good extends BaseProvider { get name() { return 'good'; } async getScheduledMatches() { return [{ id: 'ok' }]; } }
  const f = new FailoverProvider([new Bad(), new Good()]);
  assert.deepEqual(await f.getScheduledMatches('2026-11-27'), [{ id: 'ok' }]);
  await assert.rejects(new FailoverProvider([new Bad()]).getScheduledMatches('x'));
});

test('API-Football: la cuota agotada lanza error para que actúe el respaldo', async () => {
  const http = fakeHttp({ '/fixtures?date=': { response: [], errors: { requests: 'You have reached the request limit for the day, go to dashboard' } } });
  const p = new ApiFootballProvider({ apiKey: 'x', http });
  await assert.rejects(() => p.getScheduledMatches('2026-11-27'), (e) => e.code === 'QUOTA' && /request limit/i.test(e.message));
});

test('failover: cada llamada usa el proveedor dueño del ID (no mezcla equipos)', async () => {
  const calls = [];
  class A extends BaseProvider {
    get name() { return 'api-football'; }
    async getScheduledMatches() { throw new Error('cuota agotada'); }
    async getTeamRecentMatches(id) { calls.push(['api', id]); return [{ id: 'api' }]; }
  }
  class B extends BaseProvider {
    get name() { return 'football-data'; }
    async getScheduledMatches() { return [{ id: 'football-data:event:1' }]; }
    async getTeamRecentMatches(id) { calls.push(['fd', id]); return [{ id: 'fd' }]; }
  }
  const f = new FailoverProvider([new A(), new B()]);
  assert.deepEqual(await f.getScheduledMatches('2026-11-27'), [{ id: 'football-data:event:1' }]);
  assert.deepEqual(await f.getTeamRecentMatches('football-data:team:2', 5), [{ id: 'fd' }]);
  assert.deepEqual(await f.getTeamRecentMatches('api-football:team:9', 5), [{ id: 'api' }]);
  assert.deepEqual(calls, [['fd', 'football-data:team:2'], ['api', 'api-football:team:9']]);
});

test('carga inicial del histórico: guarda temporadas completas y rechaza datos inválidos', async () => {
  const repos = createRepositories(new Database(':memory:'));
  const mk = (i, valid = true) => ({ id: `football-data:event:${i}`, provider: 'football-data', startTime: 1780000000 + i * 3600, status: 'finished',
    homeGoals: valid ? i % 3 : -1, awayGoals: 1, tournament: { id: 'football-data:comp:2021', name: 'PL' },
    home: { id: `football-data:team:${i % 6}`, name: `T${i % 6}` }, away: { id: `football-data:team:${(i + 1) % 6}`, name: `T${(i + 1) % 6}` } });
  class P extends BaseProvider {
    get name() { return 'football-data'; }
    get requestCount() { return 0; }
    defaultCompetitions() { return [2021]; }
    async getRecentSeasons(_c, n) { return Array.from({ length: n }, (_, i) => ({ id: String(2026 - i), name: `${2026 - i}` })); }
    async getSeasonMatches(_c, s) { const base = s === '2026' ? 0 : 100; return Array.from({ length: 50 }, (_, i) => mk(base + i, i !== 7)); }
  }
  const r = await runBootstrap({ provider: new P(), repos, seasons: 2 });
  assert.equal(r.seasons, 2);
  assert.equal(r.saved, 98);
  assert.equal(r.rejected, 2);
  assert.equal(repos.counts().finished, 98);
});

test('métricas sin doble conteo: una fila por evento; yield y ROI correctos; IC por bootstrap', () => {
  const rows = [
    { market: 'OU', selection: 'over', probability: 0.6, outcome: 1, is_pick: 1, odds: 2 },
    { market: 'OU', selection: 'under', probability: 0.4, outcome: 0, is_pick: 0 },
    { market: 'BTTS', selection: 'yes', probability: 0.5, outcome: 0, is_pick: 1, odds: 1.8 },
    { market: 'BTTS', selection: 'no', probability: 0.5, outcome: 1, is_pick: 0 },
    { market: '1X2', selection: '1', probability: 0.5, outcome: 1, is_pick: 0, forecast_id: 1 },
  ];
  assert.equal(primaryRows(rows).length, 2);
  const r = roi(rows, 100);
  close(r.profit, 0); close(r.yield, 0); close(r.roi, 0);
  const rep = fullReport(rows);
  assert.equal(rep.events, 2);
  assert.equal(rep.overall.n, 2);
  const ci = bootstrapCI(Array.from({ length: 200 }, (_, i) => ({ probability: 0.6, outcome: i % 2 })), (x) => x.reduce((a, y) => a + y.outcome, 0) / x.length);
  assert.ok(ci.low < 0.5 && ci.high > 0.5);
});

test('Doble Oportunidad: probabilidad implícita derivada del 1X2 SIN margen', () => {
  const m = impliedNoVig([
    { market: '1X2', selection: '1', line: 0, decimal_odds: 2.0 }, { market: '1X2', selection: 'X', line: 0, decimal_odds: 3.5 }, { market: '1X2', selection: '2', line: 0, decimal_odds: 4.0 },
    { market: 'DC', selection: '1X', line: 0, decimal_odds: 1.25 },
  ]);
  const s = 1 / 2 + 1 / 3.5 + 1 / 4;
  close(m.get('DC|1X|0').impliedNoVig, (1 / 2 + 1 / 3.5) / s);
  assert.ok(m.get('DC|1X|0').impliedNoVig < m.get('DC|1X|0').implied);
});

test('vivo: probabilidades con el tiempo restante (Poisson) y casos límite', () => {
  close(overProb(3, 0.5, 2.5), 1);
  close(overProb(0, 0, 0.5), 0);
  const start = 1_000_000;
  const out = { status: 'ok', lambdas: { home: 1.5, away: 1.0 }, corners: { available: false }, cards: { available: false } };
  const lead = analyzeLive({ start_time: start, home_goals: 2, away_goals: 0 }, null, [], out, start + 105 * 60);
  assert.equal(lead.minute, 90);
  close(lead.probabilities['1X2'][1], 1, 1e-9);
  const early = analyzeLive({ start_time: start, home_goals: 0, away_goals: 0 }, null, [], out, start + 10 * 60);
  const p = early.probabilities['1X2'];
  close(p[1] + p.X + p[2], 1, 1e-9);
  assert.ok(p[1] > p[2]);
  assert.equal(analyzeLive({ start_time: start, home_goals: 0, away_goals: 0 }, null, [], null, start + 600).probabilities, null);
});

test('exposición diaria: solo las mejores apuestas hasta el límite', () => {
  const db = new Database(':memory:');
  const repos = createRepositories(db);
  const t = 1_790_000_000;
  for (let i = 0; i < 4; i++) {
    repos.upsertMatch({ id: `x:event:${i}`, provider: 'x', startTime: t + i, status: 'notstarted', home: { id: `x:team:${i}a`, name: 'A' }, away: { id: `x:team:${i}b`, name: 'B' } });
    const fid = repos.saveForecast({ matchId: `x:event:${i}`, modelVersion: 't', params: {}, inputs: {}, output: { status: 'ok' }, quality: {},
      valueBets: [{ market: '1X2', selection: '1', line: 0, odds: 2, probability: 0.6, impliedNoVig: 0.5, edge: 0.1, ev: 0.1 * (i + 1), kelly: 0.2, stake: 4, confidence: 80, accepted: true }] }, []);
    assert.ok(fid);
  }
  const r = repos.applyDailyExposure(t - 10, t + 10, { maxBets: 5, maxStake: 10 });
  assert.equal(r.accepted, 2);
  assert.equal(r.cut, 2);
  const kept = repos.valueBetsBetween(t - 10, t + 10).filter((v) => v.accepted).map((v) => v.match_id).sort();
  assert.deepEqual(kept, ['x:event:2', 'x:event:3'], 'se conservan las de mayor EV');
});

test('ρ de Dixon-Coles restringido a [-0.2, 0]', () => {
  const samples = Array.from({ length: 300 }, (_, i) => ({ lambdaHome: 1.3, lambdaAway: 1.1, homeGoals: i % 4, awayGoals: (i + 1) % 3 }));
  const r = fitRho(samples);
  assert.ok(r.rho >= -0.2 && r.rho <= 0);
});

test('WhatsApp: mensaje con nivel de confianza y apuestas de valor', () => {
  const txt = buildTopMessage({ confidence: [{ match: 'A vs B', label: 'Gana A', probability: 0.71, confidenceGrade: 'A' }], value: [{ match: 'A vs B', label: 'Gana A', odds: 1.9, ev: 0.12, stake: 2 }] }, '2026-11-27');
  assert.match(txt, /A vs B · Gana A · 71% · A/);
  assert.match(txt, /EV \+12%/);
});
