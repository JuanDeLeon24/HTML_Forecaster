'use strict';
/**
 * Learning Engine – ajuste automático con datos reales liquidados:
 *  1. Pesos del ensamble 1X2 (Poisson / Elo / Ponderado): búsqueda en rejilla sobre
 *     el símplex minimizando el Brier multiclase; resultado encogido hacia los
 *     pesos por defecto según la muestra: w = α·w_opt + (1−α)·w_def, α = n/(n+200).
 *  2. ρ de Dixon-Coles por máxima verosimilitud con los λ guardados de cada pronóstico.
 * Cada cambio queda registrado en model_params_history (auditable).
 */
const config = require('../config');
const { createLogger } = require('../lib/logger');
const { fitRho } = require('../models/poisson');

const log = createLogger('learning');

function collect1X2(repos) {
  const rows = repos.settledPredictions({ market: '1X2' });
  const byF = new Map();
  for (const r of rows) {
    if (!r.components_json) continue;
    if (!byF.has(r.forecast_id)) byF.set(r.forecast_id, {});
    byF.get(r.forecast_id)[r.selection] = { c: JSON.parse(r.components_json), o: r.outcome };
  }
  return [...byF.values()].filter((g) => g['1'] && g.X && g['2'] && g['1'].c.elo !== null);
}

function brierOf(groups, w) {
  let s = 0;
  for (const g of groups) {
    let tw = 0;
    const p = { 1: 0, X: 0, 2: 0 };
    for (const m of ['poisson', 'elo', 'weighted']) {
      if (!w[m]) continue;
      for (const k of ['1', 'X', '2']) p[k] += w[m] * g[k].c[m];
      tw += w[m];
    }
    for (const k of ['1', 'X', '2']) s += (p[k] / tw - g[k].o) ** 2;
  }
  return s / groups.length;
}

function learnEnsembleWeights(repos, { minSamples = 30, step = 0.05 } = {}) {
  const groups = collect1X2(repos);
  if (groups.length < minSamples) return { updated: false, reason: `Se necesitan ≥${minSamples} partidos 1X2 liquidados con los 3 modelos (hay ${groups.length}).` };
  let best = null;
  const steps = Math.round(1 / step);
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; i + j <= steps; j++) {
      const w = { poisson: i / steps, elo: j / steps, weighted: (steps - i - j) / steps };
      const br = brierOf(groups, w);
      if (!best || br < best.brier) best = { w, brier: br };
    }
  }
  const def = config.model.ensemble;
  const alpha = groups.length / (groups.length + 200);
  const w = {};
  for (const k of Object.keys(def)) w[k] = Math.round((alpha * best.w[k] + (1 - alpha) * def[k]) * 1000) / 1000;
  const metric = {
    brierOptimal: best.brier, optimalWeights: best.w, brierFinal: brierOf(groups, w), brierDefault: brierOf(groups, def),
    brierSingle: { poisson: brierOf(groups, { poisson: 1 }), elo: brierOf(groups, { elo: 1 }), weighted: brierOf(groups, { weighted: 1 }) }, alpha,
  };
  repos.setParam('ensemble_weights', w, groups.length, metric);
  log.info('Pesos del ensamble actualizados', { w, n: groups.length });
  return { updated: true, weights: w, sampleSize: groups.length, metric };
}

/** ρ de Dixon-Coles por MV condicional a los λ guardados de cada pronóstico liquidado. */
function learnRho(repos, { minSamples = 150 } = {}) {
  const samples = repos.settledLambdas();
  const best = fitRho(samples, { minSamples });
  if (!best) return { updated: false, reason: `Se necesitan ≥${minSamples} partidos liquidados (hay ${samples.length}).` };
  const def = config.model.dixonColesRho;
  const alpha = samples.length / (samples.length + 300);
  const rho = Math.round((alpha * best.rho + (1 - alpha) * def) * 1000) / 1000;
  repos.setParam('dixon_coles_rho', rho, samples.length, { mle: best.rho, logLik: best.ll, alpha });
  log.info('rho Dixon-Coles actualizado', { rho, n: samples.length });
  return { updated: true, rho, mle: best.rho, sampleSize: samples.length };
}

function learnAll(repos) {
  return { ensemble: learnEnsembleWeights(repos), rho: learnRho(repos) };
}

module.exports = { learnEnsembleWeights, learnRho, learnAll, brierOf, collect1X2 };
