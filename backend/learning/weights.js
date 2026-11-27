'use strict';
/**
 * Learning Engine (aprendizaje continuo) – se ejecuta tras liquidar resultados.
 *  1. Regresión logística 1X2 (entrenada solo con partidos ya jugados).
 *  2. Pesos del ensamble (Poisson-DC, Elo, Ponderado, xG, Logística).
 *  3. Calibración por mercado (Platt / Isotónica / ninguna).
 *  4. ρ de Dixon-Coles.
 *  5. Detección de deriva y backtesting.
 *
 * Reglas (especificación): NO se modifican pesos cuando
 *   - la muestra es insuficiente,
 *   - hay alta varianza (mejora media < 1 error estándar en validación temporal),
 *   - hay evidencia de sobreajuste (la mejora dentro de muestra no se sostiene fuera de muestra).
 * Toda evaluación usa validación temporal (expanding window); jamás datos posteriores al partido.
 * Cada decisión (adoptada o no) queda en ml_training_history.
 */
const config = require('../config');
const { createLogger } = require('../lib/logger');
const { fitRho } = require('../models/poisson');
const logistic = require('../models/logistic');
const { chooseCalibration, calibrationError, sharpness } = require('../calibration');
const { splits, pairedImprovement, detectDrift } = require('./walkForward');
const { runBacktests } = require('../backtesting');
const { binaryMetrics } = require('../validation/metrics');

const log = createLogger('learning');
const MODELS = ['poisson', 'elo', 'weighted', 'xg', 'logistic'];
const now = () => Math.floor(Date.now() / 1000);

/** Partidos 1X2 liquidados con la probabilidad de cada submodelo, en orden cronológico. */
function collect1X2(repos) {
  const rows = repos.settledPredictions({ market: '1X2' });
  const byF = new Map();
  for (const r of rows) {
    if (!r.components_json) continue;
    if (!byF.has(r.forecast_id)) byF.set(r.forecast_id, { t: r.start_time });
    byF.get(r.forecast_id)[r.selection] = { c: JSON.parse(r.components_json), o: r.outcome };
  }
  return [...byF.values()].filter((g) => g['1'] && g.X && g['2']).sort((a, b) => a.t - b.t);
}

function blendLoss(g, w) {
  let tw = 0;
  const p = { 1: 0, X: 0, 2: 0 };
  for (const m of MODELS) {
    const wm = w[m] || 0;
    if (!wm || g['1'].c[m] === null || g['1'].c[m] === undefined) continue;
    for (const k of ['1', 'X', '2']) p[k] += wm * g[k].c[m];
    tw += wm;
  }
  if (!tw) return null;
  return ['1', 'X', '2'].reduce((s, k) => s + (p[k] / tw - g[k].o) ** 2, 0);
}

const meanLoss = (groups, w) => {
  const l = groups.map((g) => blendLoss(g, w)).filter((x) => x !== null);
  return l.length ? l.reduce((a, b) => a + b, 0) / l.length : Infinity;
};

/** Rejilla sobre el símplex (paso 0.1) para los modelos con datos. */
function optimize(groups, available) {
  const steps = 10;
  let best = null;
  const rec = (i, left, w) => {
    if (i === available.length - 1) {
      const full = { ...w, [available[i]]: left / steps };
      const l = meanLoss(groups, full);
      if (!best || l < best.loss) best = { w: full, loss: l };
      return;
    }
    for (let k = 0; k <= left; k++) rec(i + 1, left - k, { ...w, [available[i]]: k / steps });
  };
  rec(0, steps, {});
  for (const m of MODELS) if (!(m in best.w)) best.w[m] = 0;
  return best;
}

function learnEnsembleWeights(repos, { current, minSamples = config.model.minLearningSample } = {}) {
  const started = now();
  const groups = collect1X2(repos);
  const cur = current || repos.getParam?.('ensemble_weights')?.value || config.model.ensemble;
  const record = (adopted, reason, extra = {}) => {
    repos.recordTraining?.({ model_name: 'ensemble_weights', training_samples: extra.train ?? groups.length, validation_samples: extra.test ?? 0, brier: extra.brier ?? null, baseline_brier: extra.base ?? null, adopted, reason, started_at: started });
  };
  if (groups.length < minSamples) {
    const reason = `Se necesitan ≥${minSamples} partidos 1X2 liquidados (hay ${groups.length}). Pesos sin cambios.`;
    record(false, reason);
    return { updated: false, reason, sampleSize: groups.length };
  }
  const available = MODELS.filter((m) => groups.filter((g) => g['1'].c[m] !== null && g['1'].c[m] !== undefined).length >= minSamples / 2);

  // Validación temporal (expanding window): optimizar con el pasado, evaluar con el bloque siguiente
  const lossBase = [], lossCand = [];
  let inSampleGain = 0, folds = 0;
  for (const s of splits(groups.length, { folds: 3, mode: 'expanding', minTrain: Math.floor(groups.length * 0.4) })) {
    const train = groups.slice(...s.train);
    const test = groups.slice(...s.test);
    const opt = optimize(train, available);
    inSampleGain += meanLoss(train, cur) - opt.loss;
    folds++;
    for (const g of test) {
      const b = blendLoss(g, cur), c = blendLoss(g, opt.w);
      if (b !== null && c !== null) { lossBase.push(b); lossCand.push(c); }
    }
  }
  const imp = pairedImprovement(lossBase, lossCand);
  const avgInSample = folds ? inSampleGain / folds : 0;
  const metric = { folds, holdoutN: imp.n, holdoutImprovement: imp.mean, se: imp.se, t: imp.t, inSampleImprovement: avgInSample, available };

  let reason = null;
  if (imp.mean <= 0.0002) reason = 'Los pesos optimizados no mejoran fuera de muestra de forma relevante (≥ 0.0002 de Brier).';
  else if (imp.t < 1) reason = `Alta varianza: mejora ${imp.mean.toFixed(5)} < 1 error estándar (${imp.se.toFixed(5)}).`;
  else if (avgInSample > 0 && imp.mean < 0.25 * avgInSample) reason = 'Evidencia de sobreajuste: la mejora dentro de muestra no se sostiene fuera de muestra.';
  if (reason) {
    record(false, reason, { test: imp.n, brier: null, base: null });
    log.info('Pesos del ensamble sin cambios', { reason, ...metric });
    return { updated: false, reason, sampleSize: groups.length, metric };
  }

  // Validado: optimizar con todos los datos y encoger hacia los pesos actuales según la muestra
  const all = optimize(groups, available);
  const alpha = groups.length / (groups.length + 200);
  const w = {};
  for (const m of MODELS) w[m] = Math.round((alpha * all.w[m] + (1 - alpha) * (cur[m] || 0)) * 1000) / 1000;
  metric.brierBefore = meanLoss(groups, cur);
  metric.brierAfter = meanLoss(groups, w);
  metric.brierSingle = Object.fromEntries(available.map((m) => [m, meanLoss(groups, { [m]: 1 })]));
  repos.setParam('ensemble_weights', w, groups.length, metric);
  record(true, `Mejora fuera de muestra ${imp.mean.toFixed(5)} (t=${imp.t.toFixed(2)})`, { test: imp.n, brier: metric.brierAfter, base: metric.brierBefore });
  log.info('Pesos del ensamble actualizados', { w, n: groups.length });
  return { updated: true, weights: w, sampleSize: groups.length, metric };
}

/** Regresión logística: se adopta solo si supera a Poisson-DC fuera de muestra. */
function learnLogistic(repos, { minSamples = config.model.minLogisticSample } = {}) {
  const started = now();
  const data = repos.settledForecastOutputs()
    .map((r) => ({ x: logistic.featuresOf(r.output), y: r.result, t: r.t, poisson: r.output.models?.poisson }))
    .filter((r) => r.x && r.y && r.poisson)
    .sort((a, b) => a.t - b.t);
  if (data.length < minSamples) {
    const reason = `Se necesitan ≥${minSamples} partidos con características (hay ${data.length}).`;
    repos.recordTraining?.({ model_name: 'logistic', training_samples: data.length, validation_samples: 0, adopted: false, reason, started_at: started });
    return { updated: false, reason, sampleSize: data.length };
  }
  const cut = Math.floor(data.length * (1 - config.model.holdoutFraction));
  const model = logistic.train(data.slice(0, cut).map((d) => d.x), data.slice(0, cut).map((d) => d.y), { l2: config.model.logisticL2 });
  const test = data.slice(cut);
  const loss = (p, y) => ['1', 'X', '2'].reduce((s, k) => s + (p[k] - (k === y ? 1 : 0)) ** 2, 0);
  const lb = test.map((d) => loss(d.poisson, d.y));
  const lc = test.map((d) => loss(logistic.predict(model, d.x), d.y));
  const imp = pairedImprovement(lb, lc);
  const acc = test.filter((d) => { const p = logistic.predict(model, d.x); return ['1', 'X', '2'].reduce((a, k) => (p[k] > p[a] ? k : a), '1') === d.y; }).length / test.length;
  const adopted = imp.mean > 0 && imp.t >= 1;
  const reason = adopted ? `Mejor que Poisson-DC fuera de muestra (t=${imp.t.toFixed(2)})` : 'No supera a Poisson-DC fuera de muestra de forma consistente.';
  repos.recordTraining?.({ model_name: 'logistic', training_samples: cut, validation_samples: test.length, accuracy: acc, brier: lc.reduce((a, b) => a + b, 0) / lc.length, baseline_brier: lb.reduce((a, b) => a + b, 0) / lb.length, adopted, reason, started_at: started });
  if (adopted) repos.setParam('logistic_model', logistic.train(data.map((d) => d.x), data.map((d) => d.y), { l2: config.model.logisticL2 }), data.length, { holdout: imp, accuracy: acc, importance: logistic.importance(model) });
  return { updated: adopted, reason, sampleSize: data.length, holdout: imp, accuracy: acc };
}

const CAL_FAMILIES = [['1X2', null], ['OU', 'over'], ['BTTS', 'yes'], ['CORNERS', 'over'], ['CARDS', 'over']];

function learnCalibration(repos) {
  const out = {};
  for (const [market, selection] of CAL_FAMILIES) {
    const rows = repos.settledPredictions({ market }).filter((r) => !selection || r.selection === selection);
    const pts = rows.map((r) => ({ p: r.raw_probability ?? r.probability, o: r.outcome, t: r.start_time }));
    const res = chooseCalibration(pts, { minSample: config.model.minCalibrationSample, holdoutFraction: config.model.holdoutFraction });
    const metricRows = pts.map((x) => ({ probability: x.p, outcome: x.o }));
    const ce = calibrationError(metricRows);
    const bm = binaryMetrics(metricRows);
    repos.recordCalibration?.({ scope: market, n: pts.length, brier_score: bm.brier ?? null, logloss: bm.logLoss ?? null, ece: ce.ece, mce: ce.mce, sharpness: sharpness(metricRows), method: res.adopted ? res.method : 'none' });
    if (res.adopted) repos.setParam(`calibration:${market}`, { method: res.method, ...res.model }, res.n, { holdout: res.holdout, reason: res.reason });
    else if (repos.getParam(`calibration:${market}`) && res.n >= config.model.minCalibrationSample) repos.setParam(`calibration:${market}`, { method: 'none' }, res.n, { reason: res.reason });
    out[market] = { adopted: res.adopted, method: res.method, n: res.n, reason: res.reason };
  }
  return out;
}

/** ρ de Dixon-Coles por MV condicional a los λ guardados, encogido hacia el valor por defecto. */
function learnRho(repos, { minSamples = 150 } = {}) {
  const samples = repos.settledLambdas();
  const best = fitRho(samples, { minSamples });
  if (!best) return { updated: false, reason: `Se necesitan ≥${minSamples} partidos liquidados (hay ${samples.length}).` };
  const def = config.model.dixonColesRho;
  const alpha = samples.length / (samples.length + 300);
  const rho = Math.round((alpha * best.rho + (1 - alpha) * def) * 1000) / 1000;
  repos.setParam('dixon_coles_rho', rho, samples.length, { mle: best.rho, logLik: best.ll, alpha });
  return { updated: true, rho, mle: best.rho, sampleSize: samples.length };
}

function learnAll(repos) {
  const groups = collect1X2(repos);
  const drift = detectDrift(groups.map((g) => blendLoss(g, repos.getParam('ensemble_weights')?.value || config.model.ensemble)).filter((x) => x !== null));
  const result = {
    logistic: learnLogistic(repos),
    ensemble: drift.drift ? { updated: false, reason: `Deriva detectada (z=${drift.z.toFixed(2)}): se congelan los pesos hasta estabilizar.` } : learnEnsembleWeights(repos),
    calibration: learnCalibration(repos),
    rho: learnRho(repos),
    drift,
  };
  const bt = runBacktests({ predictions: repos.settledPredictions({}), valueBets: repos.settledValueBets(), bankroll: config.model.bankroll });
  for (const [strategy, r] of Object.entries(bt)) if (r.totalBets) repos.recordBacktest?.({ strategy, ...r });
  result.backtesting = Object.fromEntries(Object.entries(bt).map(([k, v]) => [k, { bets: v.totalBets, profit: v.profit, yield: v.yield }]));
  return result;
}

module.exports = { learnEnsembleWeights, learnLogistic, learnCalibration, learnRho, learnAll, collect1X2, blendLoss, optimize, MODELS };
