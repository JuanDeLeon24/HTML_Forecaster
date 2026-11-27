'use strict';
/**
 * Métricas de evaluación sobre predicciones binarias liquidadas.
 *   Brier = media((p − o)²)            0 = perfecto · 0.25 = moneda al aire en evento 50/50
 *   LogLoss = −media(o·ln p + (1−o)·ln(1−p))
 *   Accuracy / Precision / Recall / F1 con umbral 0.5 ("se predijo que ocurre")
 *   RPS (Ranked Probability Score) para el 1X2 como resultado ordenado
 *   Calibración: 10 tramos de probabilidad → frecuencia observada
 *   ROI virtual: apuesta de 1 unidad a cada pick con cuota real registrada
 */
const EPS = 1e-12;

function binaryMetrics(rows, threshold = 0.5) {
  const n = rows.length;
  if (!n) return { n: 0 };
  let brier = 0, ll = 0, tp = 0, fp = 0, fn = 0, tn = 0, sumP = 0, sumO = 0;
  for (const r of rows) {
    const p = Math.min(1 - EPS, Math.max(EPS, r.probability));
    const o = r.outcome;
    brier += (p - o) ** 2;
    ll += -(o * Math.log(p) + (1 - o) * Math.log(1 - p));
    const yhat = r.probability >= threshold ? 1 : 0;
    if (yhat && o) tp++; else if (yhat && !o) fp++; else if (!yhat && o) fn++; else tn++;
    sumP += r.probability; sumO += o;
  }
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const baseRate = sumO / n;
  const brierScore = brier / n;
  return {
    n, brier: brierScore, logLoss: ll / n,
    // Brier Skill Score vs. predecir siempre la tasa base observada
    brierSkill: baseRate > 0 && baseRate < 1 ? 1 - brierScore / (baseRate * (1 - baseRate)) : null,
    accuracy: (tp + tn) / n, precision, recall,
    f1: precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null,
    confusion: { tp, fp, fn, tn }, meanPredicted: sumP / n, observedRate: baseRate,
  };
}

function calibration(rows, bins = 10) {
  const b = Array.from({ length: bins }, (_, i) => ({ from: i / bins, to: (i + 1) / bins, n: 0, sumP: 0, hits: 0 }));
  for (const r of rows) {
    const i = Math.min(bins - 1, Math.floor(r.probability * bins));
    b[i].n++; b[i].sumP += r.probability; b[i].hits += r.outcome;
  }
  return b.map((x) => ({ from: x.from, to: x.to, n: x.n, predicted: x.n ? x.sumP / x.n : null, observed: x.n ? x.hits / x.n : null }));
}

/** 1X2 como multiclase: agrupa las 3 filas por forecast_id. */
function multiclass1X2(rows) {
  const byF = new Map();
  for (const r of rows) {
    if (r.market !== '1X2') continue;
    if (!byF.has(r.forecast_id)) byF.set(r.forecast_id, {});
    byF.get(r.forecast_id)[r.selection] = r;
  }
  let n = 0, brier = 0, rps = 0, ll = 0, correct = 0;
  for (const g of byF.values()) {
    if (!g['1'] || !g.X || !g['2']) continue;
    n++;
    const p = [g['1'].probability, g.X.probability, g['2'].probability];
    const o = [g['1'].outcome, g.X.outcome, g['2'].outcome];
    brier += p.reduce((s, pi, i) => s + (pi - o[i]) ** 2, 0);
    const cp = [p[0], p[0] + p[1]];
    const co = [o[0], o[0] + o[1]];
    rps += ((cp[0] - co[0]) ** 2 + (cp[1] - co[1]) ** 2) / 2;
    ll += -Math.log(Math.max(EPS, p[o.indexOf(1)]));
    if (p.indexOf(Math.max(...p)) === o.indexOf(1)) correct++;
  }
  return n ? { n, brier: brier / n, rps: rps / n, logLoss: ll / n, accuracy: correct / n } : { n: 0 };
}

function yieldMetric(rows) {
  const bets = rows.filter((r) => r.is_pick && r.odds);
  const profit = bets.reduce((s, r) => s + (r.outcome ? r.odds - 1 : -1), 0);
  return { bets: bets.length, profit, yield: bets.length ? profit / bets.length : null, hitRate: bets.length ? bets.filter((r) => r.outcome).length / bets.length : null };
}

function roi(rows, bankroll = 100) {
  const bets = rows.filter((r) => r.is_pick && r.odds);
  const profit = bets.reduce((s, r) => s + (r.outcome ? r.odds - 1 : -1), 0);
  return { bets: bets.length, profit, roi: bets.length ? profit / bankroll : null, hitRate: bets.length ? bets.filter((r) => r.outcome).length / bets.length : null };
}

function bootstrapCI(rows, metricFn, iterations = 1000, seed = 42) {
  if (!rows.length) return null;
  let s = seed >>> 0;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const estimates = [];
  for (let i = 0; i < iterations; i++) {
    const sample = [];
    for (let j = 0; j < rows.length; j++) sample.push(rows[Math.floor(rng() * rows.length)]);
    estimates.push(metricFn(sample));
  }
  estimates.sort((a, b) => a - b);
  return { estimate: metricFn(rows), ciLow: estimates[Math.floor(0.025 * iterations)], ciHigh: estimates[Math.floor(0.975 * iterations)] };
}

function calibrationQuantiles(rows, bins = 10) {
  const sorted = rows.slice().sort((a, b) => a.probability - b.probability);
  const size = Math.max(1, Math.ceil(sorted.length / bins));
  const out = [];
  for (let i = 0; i < bins; i++) {
    const chunk = sorted.slice(i * size, (i + 1) * size);
    if (!chunk.length) continue;
    const n = chunk.length;
    const sumP = chunk.reduce((s, r) => s + r.probability, 0);
    const hits = chunk.reduce((s, r) => s + r.outcome, 0);
    out.push({ from: chunk[0].probability, to: chunk[chunk.length - 1].probability, n, predicted: sumP / n, observed: hits / n });
  }
  return out;
}

// Una sola fila por evento binario para evitar doble conteo en el agregado global.
function primaryRows(rows) {
  return rows.filter((r) => {
    if (r.market === 'OU' && r.selection !== 'over') return false;
    if (r.market === 'BTTS' && r.selection !== 'yes') return false;
    if (r.market === 'CORNERS' && r.selection !== 'under' && r.selection !== 'over') return false;
    if (r.market === 'CORNERS' && r.selection === 'under') return false;
    if (r.market === 'CARDS' && r.selection === 'under') return false;
    if (['1X2', 'DC', 'TEAM_OU'].includes(r.market)) return false;
    return true;
  });
}

function fullReport(rows) {
  const byMarket = {};
  for (const r of rows) (byMarket[r.market] ??= []).push(r);
  const picks = rows.filter((r) => r.is_pick);
  const prim = primaryRows(rows);
  const ym = yieldMetric(prim.length ? prim : rows);
  return {
    overall: binaryMetrics(prim.length ? prim : rows),
    picks: binaryMetrics(picks),
    result1X2: multiclass1X2(rows),
    byMarket: Object.fromEntries(Object.entries(byMarket).map(([k, v]) => [k, binaryMetrics(v)])),
    calibration: calibration(prim.length ? prim : rows),
    calibrationPicks: calibration(picks),
    calibrationQuantiles: calibrationQuantiles(prim.length ? prim : rows),
    roi: ym,
    yield: ym,
    roiBankroll: roi(prim.length ? prim : rows),
    brierCI: bootstrapCI(prim.length ? prim : rows, (s) => binaryMetrics(s).brier),
    logLossCI: bootstrapCI(prim.length ? prim : rows, (s) => binaryMetrics(s).logLoss),
    yieldCI: bootstrapCI(prim.length ? prim : rows, (s) => yieldMetric(s).yield ?? 0),
  };
}

module.exports = { binaryMetrics, calibration, calibrationQuantiles, multiclass1X2, roi, yieldMetric, bootstrapCI, fullReport };
