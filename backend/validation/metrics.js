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
const { calibrationError, sharpness, sharpnessDistribution } = require('../calibration');

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

function roi(rows) {
  const bets = rows.filter((r) => r.is_pick && r.odds);
  const profit = bets.reduce((s, r) => s + (r.outcome ? r.odds - 1 : -1), 0);
  return { bets: bets.length, profit, roi: bets.length ? profit / bets.length : null, hitRate: bets.length ? bets.filter((r) => r.outcome).length / bets.length : null };
}

function fullReport(rows) {
  const byMarket = {};
  for (const r of rows) (byMarket[r.market] ??= []).push(r);
  const picks = rows.filter((r) => r.is_pick);
  const withCal = (r) => {
    const m = binaryMetrics(r);
    if (!m.n) return m;
    return { ...m, ...calibrationError(r), sharpness: sharpness(r) };
  };
  return {
    overall: withCal(rows),
    picks: withCal(picks),
    result1X2: multiclass1X2(rows),
    byMarket: Object.fromEntries(Object.entries(byMarket).map(([k, v]) => [k, withCal(v)])),
    sharpnessDistribution: sharpnessDistribution(rows),
    calibration: calibration(rows),
    calibrationPicks: calibration(picks),
    roi: roi(rows),
  };
}

/**
 * Monitoreo: precisión diaria, semanal y mensual (Accuracy, Brier, LogLoss, ROI y Yield del pick principal).
 */
function monitoring(rows, tz = 'UTC') {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const keyOf = {
    daily: (t) => fmt.format(new Date(t * 1000)),
    weekly: (t) => { const d = new Date(fmt.format(new Date(t * 1000)) + 'T12:00:00Z'); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return `sem. ${d.toISOString().slice(0, 10)}`; },
    monthly: (t) => fmt.format(new Date(t * 1000)).slice(0, 7),
  };
  const out = {};
  for (const [period, f] of Object.entries(keyOf)) {
    const groups = new Map();
    for (const r of rows) {
      const k = f(r.start_time);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    out[period] = [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 60).map(([k, list]) => {
      const m = binaryMetrics(list);
      const r = roi(list);
      return { period: k, n: m.n, accuracy: m.accuracy, brier: m.brier, logLoss: m.logLoss, profit: r.profit, roi: r.bets ? r.profit / 100 : null, yield: r.roi, bets: r.bets };
    });
  }
  return out;
}

module.exports = { binaryMetrics, calibration, multiclass1X2, roi, fullReport, monitoring };
