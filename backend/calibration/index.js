'use strict';
/**
 * Calibración de probabilidades (Fase 1 v0.4.0 - estructura base).
 * Implementaciones mínimas; se ampliarán en las etapas 5/6.
 */
function ece(rows, bins = 10) {
  const b = Array.from({ length: bins }, () => ({ n: 0, sumP: 0, hits: 0 }));
  for (const r of rows) {
    const i = Math.min(bins - 1, Math.floor(r.probability * bins));
    b[i].n++; b[i].sumP += r.probability; b[i].hits += r.outcome;
  }
  let total = rows.length || 1;
  return b.reduce((s, x) => s + (x.n / total) * Math.abs((x.n ? x.sumP / x.n : 0) - (x.n ? x.hits / x.n : 0)), 0);
}

function mce(rows, bins = 10) {
  const b = Array.from({ length: bins }, () => ({ n: 0, sumP: 0, hits: 0 }));
  for (const r of rows) {
    const i = Math.min(bins - 1, Math.floor(r.probability * bins));
    b[i].n++; b[i].sumP += r.probability; b[i].hits += r.outcome;
  }
  return Math.max(0, ...b.filter((x) => x.n).map((x) => Math.abs(x.sumP / x.n - x.hits / x.n)));
}

function temperatureScale(probs, T = 1) {
  const scaled = probs.map((p) => Math.pow(Math.max(p, 1e-9), 1 / T));
  const s = scaled.reduce((a, b) => a + b, 0);
  return scaled.map((p) => p / s);
}

function dirichletCalibrate(probs, labels) {
  // Placeholder: identidad. Implementación completa en etapa 5.
  return probs.slice();
}

function sharpness(rows) {
  if (!rows.length) return 0;
  const mean = rows.reduce((s, r) => s + r.probability, 0) / rows.length;
  const variance = rows.reduce((s, r) => s + (r.probability - mean) ** 2, 0) / rows.length;
  return Math.sqrt(variance);
}

const { plattScale: plattImpl } = require('./platt');
const { isotonicCalibrate: isoImpl } = require('./isotonic');

function plattScale(probabilities, labels, opts) {
  return plattImpl(probabilities, labels, opts);
}

function isotonicCalibrate(probabilities, labels) {
  return isoImpl(probabilities, labels);
}

module.exports = { ece, mce, sharpness, plattScale, isotonicCalibrate, temperatureScale, dirichletCalibrate };
