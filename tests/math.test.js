'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreMatrix, marketsFromMatrix, fitRho, tau } = require('../backend/models/poisson');
const { poissonOver, countOver, poissonPmf } = require('../backend/lib/math');
const { computeRatings, eloProbabilities } = require('../backend/models/elo');
const { weightedProbabilities } = require('../backend/models/weighted');
const { binaryMetrics, multiclass1X2, calibration } = require('../backend/validation/metrics');
const { settle } = require('../backend/engine/markets');
const { jointProbability } = require('../backend/engine/combinations');
const { rescaleMatrix } = require('../backend/engine/forecast');
const { mapStatistics, mapEvent, fractionalToDecimal, mapOdds } = require('../backend/providers/sofascore/mapper');

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('matriz Poisson suma 1 y mercados coherentes', () => {
  const m = scoreMatrix(1.6, 1.1, { rho: -0.08 });
  close(m.flat().reduce((a, b) => a + b, 0), 1);
  const k = marketsFromMatrix(m);
  close(k['1X2'][1] + k['1X2'].X + k['1X2'][2], 1);
  close(k.DC['1X'], k['1X2'][1] + k['1X2'].X);
  assert.ok(k.over[1.5] > k.over[2.5] && k.over[2.5] > k.over[3.5]);
  close(k.expectedGoals.home, 1.6, 0.05);
});

test('Dixon-Coles con rho<0 aumenta 0-0 y 1-1', () => {
  const p = scoreMatrix(1.3, 1.0, { rho: 0 });
  const d = scoreMatrix(1.3, 1.0, { rho: -0.1 });
  assert.ok(d[0][0] > p[0][0]);
  assert.ok(d[1][1] > p[1][1]);
  assert.equal(tau(2, 2, 1, 1, -0.1), 1);
});

test('fitRho recupera None con muestra corta', () => {
  assert.equal(fitRho([{ lambdaHome: 1, lambdaAway: 1, homeGoals: 0, awayGoals: 0 }]), null);
});

test('poissonOver y binomial negativa', () => {
  close(poissonOver(0.5, 2), 1 - poissonPmf(0, 2));
  const nb = countOver(9.5, 10, 16);
  const po = countOver(9.5, 10, 9);
  assert.equal(nb.dist, 'negbinom');
  assert.equal(po.dist, 'poisson');
  assert.ok(nb.p > 0 && nb.p < 1);
});

test('Elo: el que gana sube, probabilidades suman 1', () => {
  const r = computeRatings([{ home_team_id: 'a', away_team_id: 'b', home_goals: 3, away_goals: 0, start_time: 1 }]);
  assert.ok(r.get('a').elo > 1500 && r.get('b').elo < 1500);
  const p = eloProbabilities(1600, 1500);
  close(p[1] + p.X + p[2], 1);
  assert.ok(p[1] > p[2]);
});

test('modelo ponderado simétrico da empate base', () => {
  const t = { last5: { ppg: 1.5 }, last10: { ppg: 1.5 }, all: { ppg: 1.5 }, venue: { ppg: 1.5 }, strength: { attack: 1, defense: 1 } };
  const p = weightedProbabilities({ home: t, away: t, h2h: { n: 0 } }, { drawRate: 0.26 });
  close(p.X, 0.26, 1e-9);
  close(p[1], p[2]);
});

test('métricas: Brier, logloss, F1, RPS', () => {
  const rows = [{ probability: 0.8, outcome: 1 }, { probability: 0.3, outcome: 0 }, { probability: 0.6, outcome: 0 }];
  const m = binaryMetrics(rows);
  close(m.brier, (0.04 + 0.09 + 0.36) / 3);
  assert.equal(m.confusion.tp, 1); assert.equal(m.confusion.fp, 1);
  close(m.precision, 0.5);
  const mc = multiclass1X2([
    { forecast_id: 1, market: '1X2', selection: '1', probability: 0.5, outcome: 1 },
    { forecast_id: 1, market: '1X2', selection: 'X', probability: 0.3, outcome: 0 },
    { forecast_id: 1, market: '1X2', selection: '2', probability: 0.2, outcome: 0 },
  ]);
  close(mc.brier, 0.25 + 0.09 + 0.04);
  close(mc.rps, ((0.5 - 1) ** 2 + (0.8 - 1) ** 2) / 2);
  assert.equal(calibration(rows).length, 10);
});

test('liquidación de mercados', () => {
  const r = { homeGoals: 2, awayGoals: 1, corners: 9, cards: null };
  assert.equal(settle({ market: '1X2', selection: '1' }, r), 1);
  assert.equal(settle({ market: 'BTTS', selection: 'yes' }, r), 1);
  assert.equal(settle({ market: 'OU', selection: 'under', line: 2.5 }, r), 0);
  assert.equal(settle({ market: 'CORNERS', selection: 'over', line: 8.5 }, r), 1);
  assert.equal(settle({ market: 'CARDS', selection: 'over', line: 3.5 }, r), null);
});

test('probabilidad conjunta exacta desde la matriz', () => {
  const matrix = scoreMatrix(1.8, 0.9, { rho: -0.05 });
  const k = marketsFromMatrix(matrix);
  const output = { scoreMatrix: matrix, match: { home: 'A', away: 'B' }, probabilities: { '1X2': k['1X2'], DC: k.DC, OU: { over: k.over }, BTTS: { yes: k.btts, no: 1 - k.btts }, TEAM_OU: k.teamOver, CORNERS: { over: { 8.5: 0.6 } }, CARDS: null } };
  const j = jointProbability(output, [{ market: '1X2', selection: '1' }, { market: 'OU', selection: 'over', line: 2.5 }]);
  assert.ok(j.joint < Math.min(k['1X2'][1], k.over[2.5]));
  assert.ok(j.correlationLift > 1, 'ganar y over 2.5 están positivamente correlacionados');
  const j2 = jointProbability(output, [{ market: '1X2', selection: '1' }, { market: 'CORNERS', selection: 'over', line: 8.5 }]);
  close(j2.joint, k['1X2'][1] * 0.6);
  assert.equal(jointProbability(output, [{ market: 'CARDS', selection: 'over', line: 3.5 }]).available, false);
});

test('reescalado de matriz respeta el 1X2 objetivo', () => {
  const m = rescaleMatrix(scoreMatrix(1.4, 1.2), { 1: 0.5, X: 0.3, 2: 0.2 });
  const k = marketsFromMatrix(m);
  close(k['1X2'][1], 0.5); close(k['1X2'].X, 0.3);
});

test('mapper Sofascore', () => {
  const e = mapEvent({ id: 9, customId: 'abc', startTimestamp: 100, status: { type: 'finished' }, tournament: { name: 'PL', uniqueTournament: { id: 17, name: 'Premier League' }, category: { name: 'England' } },
    season: { id: 5 }, homeTeam: { id: 1, name: 'A' }, awayTeam: { id: 2, name: 'B' }, homeScore: { current: 3, normaltime: 1, period1: 0 }, awayScore: { current: 2, normaltime: 1, period1: 1 } });
  assert.equal(e.id, 'sofascore:event:9');
  assert.equal(e.homeGoals, 1, 'usa marcador a 90 minutos');
  assert.equal(e.tournament.id, 'sofascore:ut:17');
  const s = mapStatistics({ statistics: [{ period: 'ALL', groups: [{ statisticsItems: [{ key: 'cornerKicks', homeValue: 7, awayValue: 3 }, { key: 'yellowCards', homeValue: 2, awayValue: 1 }] }] }] });
  assert.equal(s.available, true); assert.equal(s.homeCorners, 7); assert.equal(s.awayRed, 0);
  assert.equal(mapStatistics({}).available, false);
  assert.equal(fractionalToDecimal('6/5'), 2.2);
  const o = mapOdds({ markets: [{ marketName: 'Full time', choices: [{ name: '1', fractionalValue: '1/1' }] }, { marketName: 'Match goals', choiceGroup: '2.5', choices: [{ name: 'Over', fractionalValue: '4/5' }] }] });
  assert.deepEqual(o.map((x) => [x.market, x.selection, x.line]), [['1X2', '1', 0], ['OU', 'over', 2.5]]);
});
