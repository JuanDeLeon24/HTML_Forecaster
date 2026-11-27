'use strict';
/**
 * Manejadores de la API independientes del transporte. Los usa Express (servidor)
 * y también el enrutador en memoria de la versión de archivo único (standalone),
 * de modo que ambas versiones ejecutan exactamente la misma lógica.
 */
const config = require('../config');
const services = require('../services');
const jobs = require('../lib/jobs');
const { getProvider } = require('../providers');
const { refreshLive } = require('../collectors/live');
const { analyzeLive } = require('../engine/live');
const { sendWhatsApp, buildTopMessage } = require('../lib/whatsapp');
const { isIsoDate, today, nowSec } = require('../lib/dates');
const { buildRankings } = require('../engine/ranking');
const { jointProbability } = require('../engine/combinations');
const { fullReport, monitoring } = require('../validation/metrics');
const { runBacktests } = require('../backtesting');
const { collect1X2, blendLoss } = require('../learning/weights');
const { detectDrift } = require('../learning/walkForward');
const { label } = require('../engine/markets');
const { getModelParams } = require('../learning/params');

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const dateOf = (q, b) => {
  const d = q.date || b?.date || today();
  if (!isIsoDate(d)) throw new ApiError(400, 'Fecha inválida, use YYYY-MM-DD');
  return d;
};
const fromOf = (d) => (d && isIsoDate(d) ? services.dayRange(d)[0] : undefined);
const toOf = (d) => (d && isIsoDate(d) ? services.dayRange(d)[1] : undefined);

const routes = [
  ['GET', '/health', () => {
    const repos = services.getRepos();
    return { ok: true, version: config.model.version, provider: config.provider, fallbackProvider: config.fallbackProvider ?? null, timezone: config.timezone, standalone: !!config.standalone, whatsapp: !!config.whatsapp?.enabled, whatsappWebTo: config.whatsapp?.webTo ?? null, counts: repos.counts(), needsBootstrap: repos.counts().finished < 500, lastRuns: repos.lastRuns(5), now: nowSec() };
  }],

  ['GET', '/matches', ({ query }) => {
    const date = dateOf(query);
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
          confidence: f.output.confidence ? { score: f.output.confidence.score, grade: f.output.confidence.grade } : null,
        } : null,
      };
    });
    return { date, timezone: config.timezone, count: matches.length, matches };
  }],

  ['GET', '/forecasts/:matchId', ({ params }) => {
    const repos = services.getRepos();
    const match = repos.getMatch(params.matchId);
    if (!match) throw new ApiError(404, 'Partido no encontrado');
    const f = repos.latestForecast(params.matchId);
    const predictions = f ? repos.predictionsForForecast(f.id).map((p) => ({ ...p, label: label(p, { home: match.home_name, away: match.away_name }) })) : [];
    return { match, forecast: f, predictions, odds: repos.oddsFor(match.id), incidents: repos.incidentsFor(match.id), stats: repos.statsFor(match.id), modelPredictions: f && repos.modelPredictionsFor ? repos.modelPredictionsFor(f.id) : [] };
  }],

  ['GET', '/rankings', ({ query }) => {
    const date = dateOf(query);
    const [from, to] = services.dayRange(date);
    const repos = services.getRepos();
    const rk = buildRankings(repos.forecastsBetween(from, to), Number(query.limit) || 10);
    // El ranking de valor refleja la decisión final guardada (incluye el límite de exposición diaria)
    const accepted = new Set(repos.valueBetsBetween(from, to).filter((v) => v.accepted).map((v) => `${v.match_id}|${v.market}|${v.selection}|${v.line}`));
    rk.value = rk.value.filter((v) => accepted.has(`${v.matchId}|${v.market}|${v.selection}|${v.line}`));
    return { date, ...rk };
  }],

  ['POST', '/combination', ({ body }) => {
    const { matchId, legs } = body || {};
    if (!matchId || !Array.isArray(legs) || !legs.length) throw new ApiError(400, 'Se requiere matchId y legs[]');
    const f = services.getRepos().latestForecast(matchId);
    if (!f || f.output.status !== 'ok') throw new ApiError(404, 'No hay pronóstico disponible para ese partido');
    return jointProbability(f.output, legs.map((l) => ({ market: l.market, selection: String(l.selection), line: Number(l.line ?? 0) })));
  }],

  ['GET', '/performance', ({ query }) => {
    const repos = services.getRepos();
    const rows = repos.settledPredictions({
      from: fromOf(query.from), to: toOf(query.to), market: query.market || undefined,
      tournamentId: query.tournament || undefined, teamId: query.team || undefined,
    });
    const params = getModelParams(repos);
    const groups = collect1X2(repos);
    const drift = detectDrift(groups.map((g) => blendLoss(g, params.ensemble)).filter((x) => x !== null));
    return {
      ...fullReport(rows), params, learnedHistory: repos.allParams(), monitoring: monitoring(rows, config.timezone),
      trainingHistory: repos.trainingHistory ? repos.trainingHistory(30) : [], calibrationResults: repos.latestCalibration ? repos.latestCalibration() : [], drift,
    };
  }],

  ['GET', '/history', ({ query }) => {
    const repos = services.getRepos();
    const items = repos.history({ from: fromOf(query.from), to: toOf(query.to), tournamentId: query.tournament || undefined, teamId: query.team || undefined });
    const picks = new Map(repos.picksForForecasts(items.map((i) => i.forecast_id)).map((p) => [p.forecast_id, p]));
    return {
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
    };
  }],

  ['GET', '/backtesting', () => {
    const repos = services.getRepos();
    const bt = runBacktests({ predictions: repos.settledPredictions({}), valueBets: repos.settledValueBets(), bankroll: config.model.bankroll });
    return { bankroll: config.model.bankroll, strategies: bt };
  }],

  ['GET', '/value-bets', ({ query }) => {
    const date = dateOf(query);
    const [from, to] = services.dayRange(date);
    const rows = services.getRepos().valueBetsBetween(from, to).map((v) => ({
      ...v, match: `${v.home_name} vs ${v.away_name}`, label: label(v, { home: v.home_name, away: v.away_name }),
    }));
    return { date, bankroll: config.model.bankroll, kellyFraction: config.model.kellyFraction, accepted: rows.filter((v) => v.accepted), discarded: rows.filter((v) => !v.accepted) };
  }],

  ['GET', '/live', async ({ query }) => {
    const date = dateOf(query);
    const repos = services.getRepos();
    let refreshed = null;
    let refreshError = null;
    try { refreshed = (await refreshLive({ provider: getProvider(), repos, date })).summary; } catch (err) { refreshError = err.message; }
    const [from, to] = services.dayRange(date);
    const matches = repos.matchesBetween(from, to).filter((m) => m.status === 'inprogress').map((m) => {
      const forecast = repos.latestForecast(m.id);
      return { match: m, stats: repos.statsFor(m.id), live: analyzeLive(m, repos.statsFor(m.id), repos.incidentsFor(m.id), forecast?.output) };
    });
    return { date, count: matches.length, refreshed, refreshError, matches };
  }],

  /** Texto del resumen para enviarlo desde WhatsApp Web (tu cuenta) sin APIs de pago. */
  ['GET', '/notify/preview', ({ query }) => {
    const date = dateOf(query);
    const [from, to] = services.dayRange(date);
    const repos = services.getRepos();
    const rk = buildRankings(repos.forecastsBetween(from, to), 10);
    const accepted = new Set(repos.valueBetsBetween(from, to).filter((v) => v.accepted).map((v) => `${v.match_id}|${v.market}|${v.selection}|${v.line}`));
    rk.value = rk.value.filter((v) => accepted.has(`${v.matchId}|${v.market}|${v.selection}|${v.line}`));
    return { date, text: buildTopMessage(rk, date), to: config.whatsapp?.webTo ?? null };
  }],

  ['POST', '/notify', async ({ query, body }) => {
    const date = dateOf(query, body);
    const [from, to] = services.dayRange(date);
    const rankings = buildRankings(services.getRepos().forecastsBetween(from, to), 10);
    const text = buildTopMessage(rankings, date);
    const result = await sendWhatsApp(text);
    return { sent: true, text, result };
  }],

  ['GET', '/export', ({ query }) => {
    const repos = services.getRepos();
    const esc = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const line = (arr) => arr.map(esc).join(',');
    let rows;
    if (query.type === 'value') {
      rows = [line(['fecha', 'partido', 'mercado', 'seleccion', 'linea', 'cuota', 'prob_modelo', 'prob_implicita', 'edge', 'ev', 'stake', 'confianza', 'aceptada', 'motivo', 'resultado', 'beneficio'])];
      for (const v of repos.valueBetsBetween(0, 2 ** 31)) rows.push(line([new Date(v.start_time * 1000).toISOString(), `${v.home_name} vs ${v.away_name}`, v.market, v.selection, v.line, v.odds, v.model_probability, v.bookmaker_probability, v.edge_percent, v.expected_value, v.stake, v.confidence_score, v.accepted, v.discard_reason, v.outcome, v.profit]));
    } else {
      rows = [line(['prediccion', 'pronostico', 'partido', 'fecha', 'mercado', 'seleccion', 'linea', 'probabilidad', 'prob_cruda', 'confianza', 'cuota', 'pick', 'resultado'])];
      for (const r of repos.settledPredictions({})) rows.push(line([r.id, r.forecast_id, r.match_id, new Date(r.start_time * 1000).toISOString(), r.market, r.selection, r.line, r.probability, r.raw_probability, r.confidence_score, r.odds, r.is_pick, r.outcome]));
    }
    return { type: query.type || 'predictions', filename: `html_forecaster_${query.type || 'predicciones'}.csv`, csv: rows.join('\n') };
  }],

  ['GET', '/teams', ({ query }) => services.getRepos().teamsSearch(String(query.q || ''))],

  ['GET', '/model', () => {
    const repos = services.getRepos();
    return { params: getModelParams(repos), learned: repos.allParams() };
  }],

  // ---- acciones (tareas en segundo plano)
  ['POST', '/collect', ({ query, body }) => {
    const date = dateOf(query, body);
    const r = jobs.start('collect', async (progress) => {
      const collected = await services.collect(date, progress);
      const forecasted = services.forecast(date);
      return { collected, forecasted };
    });
    return { status: r.alreadyRunning ? 409 : 202, body: r };
  }],
  ['POST', '/forecast', ({ query, body }) => services.forecast(dateOf(query, body))],
  ['POST', '/bootstrap', () => {
    const r = jobs.start('bootstrap', (progress) => services.bootstrap(progress));
    return { status: r.alreadyRunning ? 409 : 202, body: r };
  }],
  ['POST', '/settle', () => ({ status: 202, body: jobs.start('settle', async () => ({ settled: await services.settle(), learned: services.learn() })) })],
  ['POST', '/learn', () => services.learn()],
  ['GET', '/jobs', () => jobs.list()],
  ['GET', '/jobs/:id', ({ params }) => {
    const j = jobs.get(params.id);
    if (!j) throw new ApiError(404, 'Job no encontrado');
    return j;
  }],
];

/** Compila '/forecasts/:matchId' → { regex, keys } */
const compiled = routes.map(([method, path, handler]) => {
  const keys = [];
  const regex = new RegExp(`^${path.replace(/:(\w+)/g, (_m, k) => { keys.push(k); return '([^/]+)'; })}$`);
  return { method, path, regex, keys, handler };
});

/**
 * Despacha una petición. Devuelve { status, body }. Los manejadores pueden devolver
 * directamente el cuerpo (status 200) o { status, body } explícito.
 */
async function dispatch(method, pathname, query = {}, body = null) {
  for (const r of compiled) {
    if (r.method !== method) continue;
    const m = pathname.match(r.regex);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    try {
      const out = await r.handler({ params, query, body });
      if (out && typeof out === 'object' && 'status' in out && 'body' in out && Object.keys(out).length === 2) return out;
      return { status: 200, body: out };
    } catch (err) {
      return { status: err.status || 500, body: { error: err.message || 'Error interno' }, error: err };
    }
  }
  return { status: 404, body: { error: 'Ruta no encontrada' } };
}

module.exports = { dispatch, routes, ApiError };
