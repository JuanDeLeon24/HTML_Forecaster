'use strict';
/**
 * Validation Engine: compara cada predicción pendiente con el resultado real.
 * Se ejecuta para partidos iniciados hace ≥ 2.5 h. Partidos aplazados/cancelados → predicciones anuladas.
 */
const { createLogger } = require('../lib/logger');
const { nowSec } = require('../lib/dates');
const { refreshMatchResult } = require('../collectors/results');
const { settle } = require('../engine/markets');
const { analyze } = require('./failureAnalysis');

const log = createLogger('settle');

function resultFromDb(repos, matchId) {
  const m = repos.getMatch(matchId);
  const s = repos.statsFor(matchId);
  const has = s && s.available === 1;
  return {
    match: m, stats: s,
    result: {
      homeGoals: m.home_goals, awayGoals: m.away_goals,
      corners: has && s.home_corners !== null ? s.home_corners + s.away_corners : null,
      cards: has && s.home_yellow !== null ? s.home_yellow + s.away_yellow + (s.home_red ?? 0) + (s.away_red ?? 0) : null,
    },
  };
}

/** Liquida un partido ya actualizado en la base. Devuelve nº de predicciones liquidadas. */
function settleMatch(repos, matchId) {
  const { match, stats, result } = resultFromDb(repos, matchId);
  const open = repos.openPredictionsFor(matchId);
  if (!open.length) return 0;
  if (['postponed', 'canceled'].includes(match.status)) {
    for (const p of open) repos.settlePrediction(p.id, null);
    return 0;
  }
  if (match.status !== 'finished' || match.home_goals === null) return 0;
  let n = 0;
  for (const p of open) {
    const outcome = settle({ market: p.market, selection: p.selection, line: p.line }, result);
    repos.settlePrediction(p.id, outcome);
    if (outcome !== null) n++;
  }
  // Apuestas de valor registradas antes del partido
  for (const v of repos.openValueBets ? repos.openValueBets(matchId) : []) {
    const o = settle({ market: v.market, selection: v.selection, line: v.line }, result);
    if (o !== null) repos.settleValueBet(v.id, o, o ? v.stake * (v.odds - 1) : -v.stake);
  }
  const forecast = repos.latestForecast(matchId);
  if (forecast && forecast.output.status === 'ok') {
    const settled = repos.predictionsForForecast(forecast.id).filter((p) => p.outcome !== null && !p.void);
    repos.setPostAnalysis(forecast.id, analyze({ forecast, result, stats, incidents: repos.incidentsFor(matchId), settled }));
  }
  return n;
}

async function settlePending({ provider, repos, minAgeSec = 9000 }) {
  const runId = repos.startRun('settle');
  const pending = repos.openPredictionMatches(nowSec() - minAgeSec);
  const summary = { matches: pending.length, settledMatches: 0, predictions: 0, stillOpen: 0, errors: 0 };
  for (const m of pending) {
    try {
      await refreshMatchResult(m.id, { provider, repos });
      const n = settleMatch(repos, m.id);
      if (n > 0) { summary.settledMatches++; summary.predictions += n; } else summary.stillOpen++;
    } catch (err) {
      summary.errors++;
      log.warn('No se pudo liquidar', { matchId: m.id, err: err.message });
    }
  }
  repos.finishRun(runId, 'ok', { requests: provider.requestCount, summary });
  log.info('Liquidación completada', summary);
  return summary;
}

module.exports = { settlePending, settleMatch };
