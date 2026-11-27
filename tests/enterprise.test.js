'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMatch, sanitizeStats, validateOdds, validateForecastOutput } = require('../backend/validators');
const { bivariateMatrix } = require('../backend/models/bivariatePoisson');
const { scoreMatrix } = require('../backend/models/poisson');
const { fitIsotonic, applyIsotonic } = require('../backend/calibration/isotonic');
const { fitPlatt, applyPlatt } = require('../backend/calibration/platt');
const { calibrationError, sharpness, chooseCalibration } = require('../backend/calibration');
const { splits, pairedImprovement, detectDrift } = require('../backend/learning/walkForward');
const { summarize } = require('../backend/backtesting');
const logistic = require('../backend/models/logistic');
const { grade, confidenceScore } = require('../backend/engine/confidence');
const { evaluateValue } = require('../backend/engine/valueBets');
const modelConfig = require('../backend/modelConfig');
const { computeRatings } = require('../backend/models/elo');

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const goodMatch = { id: 'sofascore:event:1', provider: 'sofascore', startTime: 1790000000, status: 'finished', homeGoals: 2, awayGoals: 1,
  home: { id: 'sofascore:team:1', name: 'A' }, away: { id: 'sofascore:team:2', name: 'B' }, tournament: { id: 'sofascore:ut:17', name: 'PL' } };

test('validación de partidos: rechaza NaN, negativos, fechas y estados inválidos', () => {
  assert.deepEqual(validateMatch(goodMatch), []);
  assert.ok(validateMatch({ ...goodMatch, homeGoals: NaN }).length);
  assert.ok(validateMatch({ ...goodMatch, homeGoals: -1 }).length);
  assert.ok(validateMatch({ ...goodMatch, startTime: Infinity }).length);
  assert.ok(validateMatch({ ...goodMatch, status: 'raro' }).length);
  assert.ok(validateMatch({ ...goodMatch, away: goodMatch.home }).length);
  assert.ok(validateMatch({ ...goodMatch, status: 'notstarted' }).length, 'no terminado con marcador');
});

test('validación de estadísticas: anula campos inválidos y conserva el resto', () => {
  const s = sanitizeStats({ available: true, homeCorners: 5, awayCorners: -2, homePossession: 70, awayPossession: 50, homeXg: NaN, awayXg: 1.2, homeShots: 3, homeSot: 5 });
  assert.equal(s.homeCorners, 5);
  assert.equal(s.awayCorners, null);
  assert.equal(s.homePossession, null);
  assert.equal(s.homeXg, null);
  assert.equal(s.homeSot, null, 'tiros al arco > tiros');
  assert.equal(sanitizeStats({ available: false }).available, false);
});

test('validación de cuotas y de probabilidades de salida', () => {
  assert.equal(validateOdds({ market: '1X2', decimalOdds: 2.1 }).length, 0);
  assert.ok(validateOdds({ market: '1X2', decimalOdds: 0.9 }).length);
  assert.ok(validateOdds({ market: '1X2', decimalOdds: Infinity }).length);
  const ok = { probabilities: { '1X2': { 1: 0.5, X: 0.3, 2: 0.2 }, OU: { over: { 2.5: 0.5 } } }, lambdas: { home: 1.2, away: 1 } };
  assert.deepEqual(validateForecastOutput(ok), []);
  assert.ok(validateForecastOutput({ ...ok, probabilities: { ...ok.probabilities, OU: { over: { 2.5: 1.2 } } } }).length);
  assert.ok(validateForecastOutput({ ...ok, probabilities: { '1X2': { 1: 0.5, X: 0.5, 2: 0.5 } } }).length);
});

test('Poisson bivariado: suma 1, conserva medias y con λ3=0 equivale al independiente', () => {
  const { matrix } = bivariateMatrix(1.6, 1.1, { lambda3: 0.15 });
  close(matrix.flat().reduce((a, b) => a + b, 0), 1);
  let eh = 0; for (let x = 0; x < matrix.length; x++) for (let y = 0; y < matrix.length; y++) eh += x * matrix[x][y];
  close(eh, 1.6, 0.01);
  const ind = bivariateMatrix(1.6, 1.1, { lambda3: 0 }).matrix;
  const p = scoreMatrix(1.6, 1.1, { rho: 0 });
  close(ind[1][1], p[1][1], 1e-9);
  assert.ok(matrix[0][0] !== p[0][0]);
});

test('Elo local/visitante se actualiza por sede', () => {
  const r = computeRatings([{ home_team_id: 'a', away_team_id: 'b', home_goals: 2, away_goals: 0, start_time: 1 }]);
  assert.ok(r.get('a').home > 1500 && r.get('a').away === 1500);
  assert.ok(r.get('b').away < 1500 && r.get('b').home === 1500);
});

test('calibración: isotónica monótona, Platt corrige sobreconfianza, ECE/MCE/sharpness', () => {
  const iso = fitIsotonic([{ p: 0.1, o: 0 }, { p: 0.2, o: 1 }, { p: 0.3, o: 0 }, { p: 0.9, o: 1 }]);
  for (let i = 1; i < iso.ys.length; i++) assert.ok(iso.ys[i] >= iso.ys[i - 1]);
  assert.ok(applyIsotonic(iso, 0.95) <= 0.995);
  // Modelo sobreconfiado: dice 90% y ocurre 60%
  const pts = [];
  for (let i = 0; i < 500; i++) pts.push({ p: 0.9, o: i % 10 < 6 ? 1 : 0 }, { p: 0.1, o: i % 10 < 4 ? 1 : 0 });
  const pl = fitPlatt(pts);
  close(applyPlatt(pl, 0.9), 0.6, 0.02);
  const rows = pts.map((x) => ({ probability: x.p, outcome: x.o }));
  const ce = calibrationError(rows);
  close(ce.ece, 0.3, 1e-9);
  close(ce.mce, 0.3, 1e-9);
  close(sharpness(rows), 0.8, 1e-9);
});

test('calibración automática: adopta con mejora validada y rechaza sin muestra', () => {
  const pts = [];
  for (let i = 0; i < 1000; i++) pts.push({ p: 0.85, o: i % 10 < 6 ? 1 : 0, t: i }, { p: 0.15, o: i % 10 < 4 ? 1 : 0, t: i });
  const r = chooseCalibration(pts, { minSample: 300 });
  assert.equal(r.adopted, true, r.reason);
  assert.equal(chooseCalibration(pts.slice(0, 50), { minSample: 300 }).adopted, false);
  // Bien calibrado: no debe cambiar nada
  const good = [];
  for (let i = 0; i < 1000; i++) good.push({ p: 0.6, o: i % 10 < 6 ? 1 : 0, t: i });
  assert.equal(chooseCalibration(good, { minSample: 300 }).adopted, false);
});

test('walk-forward: el entrenamiento nunca incluye datos posteriores al bloque de prueba', () => {
  for (const mode of ['expanding', 'rolling']) {
    const s = splits(100, { folds: 4, mode, minTrain: 40, window: 30 });
    assert.equal(s.length, 4);
    for (const f of s) assert.ok(f.train[1] <= f.test[0]);
    if (mode === 'rolling') assert.ok(s.every((f) => f.train[1] - f.train[0] <= 30));
    assert.equal(s[s.length - 1].test[1], 100);
  }
  const imp = pairedImprovement([0.3, 0.3, 0.3], [0.2, 0.25, 0.2]);
  assert.ok(imp.mean > 0 && imp.t > 1);
  const losses = Array(200).fill(0.2).concat(Array(50).fill(0.4)).map((x, i) => x + (i % 3) * 0.01);
  assert.equal(detectDrift(losses).drift, true);
  assert.equal(detectDrift(Array(250).fill(0).map((_, i) => 0.2 + (i % 3) * 0.01)).drift, false);
});

test('backtesting: beneficio, yield y drawdown máximo', () => {
  const r = summarize([{ t: 1, stake: 1, odds: 2, outcome: 1 }, { t: 2, stake: 1, odds: 2, outcome: 0 }, { t: 3, stake: 1, odds: 2, outcome: 0 }, { t: 4, stake: 1, odds: 3, outcome: 1 }], 100);
  close(r.profit, 1);
  close(r.yield, 0.25);
  close(r.roi, 0.01);
  close(r.maxDrawdown, 2);
});

test('regresión logística aprende una señal real', () => {
  const X = [], y = [];
  for (let i = 0; i < 300; i++) {
    const d = ((i * 37) % 100) / 50 - 1;
    X.push([d, 0.25, d, d, 0, d, 2.5, 0, 0, 0]);
    y.push(d > 0.3 ? '1' : d < -0.3 ? '2' : 'X');
  }
  const m = logistic.train(X, y);
  const p = logistic.predict(m, [0.9, 0.25, 0.9, 0.9, 0, 0.9, 2.5, 0, 0, 0]);
  assert.ok(p[1] > p[2] && p[1] > 0.5);
  close(p[1] + p.X + p[2], 1);
  assert.equal(logistic.importance(m).length, logistic.FEATURE_NAMES.length);
});

test('score de confianza: niveles A+…D y factores', () => {
  assert.deepEqual([95, 85, 75, 65, 10].map(grade), ['A+', 'A', 'B', 'C', 'D']);
  const t = { last5: { ppg: 2 }, last20: { ppg: 2 } };
  const hi = confidenceScore({ quality: { score: 100 }, modelProbs: [0.6, 0.6, 0.6], health: { n: 500, ece: 0, brierSkill: 0.5 }, home: t, away: t });
  assert.equal(hi.score, 100);
  const lo = confidenceScore({ quality: { score: 20 }, modelProbs: [0.2, 0.7], health: null, home: t, away: t });
  assert.ok(lo.score < 60 && lo.grade === 'D');
});

test('apuestas de valor: EV, Kelly fraccional, stake y descartes automáticos', () => {
  const params = modelConfig;
  const v = evaluateValue({ leg: { market: '1X2', selection: '1', line: 0 }, probability: 0.55, odds: 2.2, implied: 1 / 2.2, impliedNoVig: 0.44, overround: 0.04, confidence: 80, health: null, params });
  close(v.ev, 0.21, 1e-9);
  close(v.kelly, (1.2 * 0.55 - 0.45) / 1.2, 1e-9);
  assert.equal(v.accepted, true);
  assert.ok(v.stake > 0 && v.stake <= params.bankroll * params.maxStakePct);
  const low = evaluateValue({ leg: { market: '1X2', selection: '1', line: 0 }, probability: 0.55, odds: 2.2, implied: 0.45, impliedNoVig: 0.44, overround: 0.04, confidence: 40, health: null, params });
  assert.equal(low.accepted, false);
  assert.match(low.discardReason, /confianza/);
  const bad = evaluateValue({ leg: { market: '1X2', selection: '1', line: 0 }, probability: 0.55, odds: 2.2, implied: 0.45, impliedNoVig: 0.44, overround: 0.15, confidence: 80, health: { n: 300, ece: 0.1, brierSkill: -0.1 }, params });
  assert.match(bad.discardReason, /mal calibrado/);
  assert.match(bad.discardReason, /liquidez/);
});
