'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Database } = require('../backend/database/db');
const { createRepositories } = require('../backend/database/repositories');
const { runDailyCollection } = require('../backend/collectors');
const { runForecasts } = require('../backend/engine/forecast');
const { settlePending } = require('../backend/validation/settle');
const { buildRankings } = require('../backend/engine/ranking');
const { fullReport } = require('../backend/validation/metrics');
const { learnEnsembleWeights } = require('../backend/learning/weights');
const { dayRange } = require('../backend/services');
const { shiftDate, today } = require('../backend/lib/dates');
const { FakeProvider } = require('./helpers/fakeProvider');

test('pipeline completo: recolectar → pronosticar → liquidar → métricas', async () => {
  const date = shiftDate(today(), 1);
  const provider = new FakeProvider({ scheduledDate: date });
  const repos = createRepositories(new Database(':memory:'));
  const summary = await runDailyCollection(date, { provider, repos, options: { tournaments: [], maxMatches: 0 } });
  assert.equal(summary.matches, 6);
  assert.ok(repos.counts().finished > 100);

  const [from, to] = dayRange(date);
  const fsum = runForecasts(from, to, { repos });
  assert.equal(fsum.forecasted, 6);

  const forecasts = repos.forecastsBetween(from, to);
  for (const f of forecasts) {
    const p = f.output.probabilities['1X2'];
    assert.ok(Math.abs(p[1] + p.X + p[2] - 1) < 1e-3);
    assert.ok(f.output.pick && f.output.explanation.length >= 2);
    assert.ok(f.output.probabilities.CORNERS, 'corners disponibles con estadísticas');
    assert.ok(['A', 'B', 'C', 'D'].includes(f.quality.grade));
    assert.ok(f.output.value.length > 0, 'EV calculado con cuotas');
  }
  const rk = buildRankings(forecasts);
  assert.equal(rk.confidence.length, 6);
  assert.ok(rk.combinations.length > 0);

  // Re-pronosticar anula predicciones previas pendientes (solo cuenta la última)
  runForecasts(from, to, { repos });

  provider.finishScheduled();
  const s = await settlePending({ provider, repos, minAgeSec: -10 * 86400 });
  assert.equal(s.settledMatches, 6);
  const rows = repos.settledPredictions({});
  assert.ok(rows.length > 6 * 20);
  const rep = fullReport(rows);
  assert.equal(rep.result1X2.n, 6);
  assert.ok(rep.overall.brier >= 0 && rep.overall.brier <= 1);

  const f = repos.latestForecast(forecasts[0].matchId);
  assert.ok(f.postAnalysis.causes.some((c) => c.type === 'red_card'));
  assert.ok(f.postAnalysis.causes.some((c) => c.type === 'finishing_variance' || c.type === 'game_profile'));

  const l = learnEnsembleWeights(repos);
  assert.equal(l.updated, false, 'no aprende con muestra insuficiente');
});

test('muestra insuficiente → no se emite pronóstico (no se inventan datos)', () => {
  const repos = createRepositories(new Database(':memory:'));
  const date = shiftDate(today(), 1);
  const [from, to] = dayRange(date);
  repos.upsertMatch({ id: 'x:event:1', provider: 'x', tournament: null, startTime: from + 3600, status: 'notstarted',
    home: { id: 'x:team:1', name: 'Nuevo FC' }, away: { id: 'x:team:2', name: 'Recién Ascendido' } });
  const r = runForecasts(from, to, { repos });
  assert.equal(r.insufficient, 1);
  const f = repos.latestForecast('x:event:1');
  assert.equal(f.output.status, 'insufficient');
  assert.equal(repos.predictionsForForecast(f.id).length, 0);
});

test('aprendizaje de pesos con muestra suficiente favorece al mejor modelo', () => {
  // Modelo "poisson" perfecto, "elo" y "weighted" uniformes: los pesos óptimos deben ir a poisson
  const rows = [];
  for (let i = 0; i < 300; i++) {
    const res = ['1', 'X', '2'][i % 3];
    for (const s of ['1', 'X', '2']) {
      const good = s === res ? 0.9 : 0.05;
      rows.push({ forecast_id: i, selection: s, outcome: s === res ? 1 : 0, components_json: JSON.stringify({ poisson: good, elo: 1 / 3, weighted: 1 / 3 }) });
    }
  }
  const saved = {};
  const fakeRepos = { settledPredictions: () => rows, setParam: (k, v) => { saved[k] = v; } };
  const r = learnEnsembleWeights(fakeRepos);
  assert.equal(r.updated, true);
  assert.equal(r.metric.optimalWeights.poisson, 1);
  assert.ok(saved.ensemble_weights.poisson > 0.5);
});
