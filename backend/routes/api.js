'use strict';
/** API REST de HTML_FORECASTER. */
const express = require('express');
const config = require('../config');
const services = require('../services');
const jobs = require('../lib/jobs');
const { isIsoDate, today, nowSec } = require('../lib/dates');
const { buildRankings } = require('../engine/ranking');
const { jointProbability } = require('../engine/combinations');
const { fullReport } = require('../validation/metrics');
const { label } = require('../engine/markets');
const { getModelParams } = require('../learning/params');

const router = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const dateParam = (req) => {
  const d = req.query.date || req.body?.date || today();
  if (!isIsoDate(d)) { const e = new Error('Fecha inválida, use YYYY-MM-DD'); e.status = 400; throw e; }
  return d;
};
const unixFromDate = (d) => (d && isIsoDate(d) ? services.dayRange(d)[0] : undefined);

router.get('/health', (_req, res) => {
  const repos = services.getRepos();
  res.json({ ok: true, version: config.model.version, provider: config.provider, timezone: config.timezone, counts: repos.counts(), lastRuns: repos.lastRuns(5), now: nowSec() });
});

router.get('/matches', wrap((req, res) => {
  const date = dateParam(req);
  const [from, to] = services.dayRange(date);
  const repos = services.getRepos();
  const forecasts = new Map(repos.forecastsBetween(from, to).map((f) => [f.matchId, f]));
  const matches = repos.matchesBetween(from, to).map((m) => {
    const f = forecasts.get(m.id);
    return {
      id: m.id, startTime: m.start_time, status: m.status, tournament: m.tournament_name, category: m.tournament_category,
      home: m.home_name, away: m.away_name, homeGoals: m.home_goals, awayGoals: m.away_goals,
      forecast: f ? {
        status: f.output.status, reason: f.output.reason ?? null, createdAt: f.createdAt,
        p1X2: f.output.probabilities?.['1X2'] ?? null, over25: f.output.probabilities?.OU.over['2.5'] ?? null,
        btts: f.output.probabilities?.BTTS.yes ?? null, pick: f.output.pick ?? null, lambdas: f.output.lambdas ?? null,
        quality: { score: f.quality.score, grade: f.quality.grade },
      } : null,
    };
  });
  res.json({ date, timezone: config.timezone, count: matches.length, matches });
}));

router.get('/forecasts/:matchId', wrap((req, res) => {
  const repos = services.getRepos();
  const f = repos.latestForecast(req.params.matchId);
  const match = repos.getMatch(req.params.matchId);
  if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
  const predictions = f ? repos.predictionsForForecast(f.id).map((p) => ({ ...p, label: label(p, { home: match.home_name, away: match.away_name }) })) : [];
  res.json({ match, forecast: f, predictions, odds: repos.oddsFor(match.id), incidents: repos.incidentsFor(match.id), stats: repos.statsFor(match.id) });
}));

router.get('/rankings', wrap((req, res) => {
  const date = dateParam(req);
  const [from, to] = services.dayRange(date);
  res.json({ date, ...buildRankings(services.getRepos().forecastsBetween(from, to), Number(req.query.limit) || 10) });
}));

router.post('/combination', express.json(), wrap((req, res) => {
  const { matchId, legs } = req.body || {};
  if (!matchId || !Array.isArray(legs) || !legs.length) return res.status(400).json({ error: 'Se requiere matchId y legs[]' });
  const f = services.getRepos().latestForecast(matchId);
  if (!f || f.output.status !== 'ok') return res.status(404).json({ error: 'No hay pronóstico disponible para ese partido' });
  res.json(jointProbability(f.output, legs.map((l) => ({ market: l.market, selection: String(l.selection), line: Number(l.line ?? 0) }))));
}));

router.get('/performance', wrap((req, res) => {
  const repos = services.getRepos();
  const rows = repos.settledPredictions({
    from: unixFromDate(req.query.from), to: req.query.to ? services.dayRange(req.query.to)[1] : undefined,
    market: req.query.market || undefined, tournamentId: req.query.tournament || undefined, teamId: req.query.team || undefined,
  });
  res.json({ ...fullReport(rows), params: getModelParams(repos), learnedHistory: repos.allParams() });
}));

router.get('/history', wrap((req, res) => {
  const repos = services.getRepos();
  const items = repos.history({
    from: unixFromDate(req.query.from), to: req.query.to ? services.dayRange(req.query.to)[1] : undefined,
    tournamentId: req.query.tournament || undefined, teamId: req.query.team || undefined,
  });
  const picks = new Map(repos.picksForForecasts(items.map((i) => i.forecast_id)).map((p) => [p.forecast_id, p]));
  res.json({
    items: items.map((i) => {
      const p = picks.get(i.forecast_id);
      const post = i.post_analysis_json ? JSON.parse(i.post_analysis_json) : null;
      return {
        forecastId: i.forecast_id, matchId: i.match_id, startTime: i.start_time, status: i.status, tournament: i.tournament_name,
        match: `${i.home_name} vs ${i.away_name}`, score: i.home_goals !== null ? `${i.home_goals}-${i.away_goals}` : null,
        pick: p ? { label: label(p, { home: i.home_name, away: i.away_name }), probability: p.probability, outcome: p.outcome, void: p.void } : null,
        hitRate: i.total_hp ? i.hits_hp / i.total_hp : null, graded: i.total_hp, settled: i.settled, modelVersion: i.model_version,
        causes: post?.causes ?? [],
      };
    }),
    tournaments: repos.tournamentsList(),
  });
}));

router.get('/teams', wrap((req, res) => res.json(services.getRepos().teamsSearch(String(req.query.q || '')))));

router.get('/model', wrap((_req, res) => {
  const repos = services.getRepos();
  res.json({ params: getModelParams(repos), learned: repos.allParams() });
}));

// ---- acciones (tareas en segundo plano)
router.post('/collect', express.json(), wrap((req, res) => {
  const date = dateParam(req);
  const r = jobs.start('collect', async (progress) => {
    const collected = await services.collect(date, progress);
    const forecasted = services.forecast(date);
    return { collected, forecasted };
  });
  res.status(r.alreadyRunning ? 409 : 202).json(r);
}));

router.post('/forecast', express.json(), wrap((req, res) => res.json(services.forecast(dateParam(req)))));
router.post('/settle', wrap((_req, res) => res.status(202).json(jobs.start('settle', () => services.settle()))));
router.post('/learn', wrap((_req, res) => res.json(services.learn())));
router.get('/jobs', (_req, res) => res.json(jobs.list()));
router.get('/jobs/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  return j ? res.json(j) : res.status(404).json({ error: 'Job no encontrado' });
});

module.exports = router;
