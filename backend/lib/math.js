'use strict';
/** Utilidades estadísticas puras (sin efectos secundarios). */

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const sum = (a) => a.reduce((s, x) => s + x, 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);

function variance(a) {
  if (a.length < 2) return null;
  const m = mean(a);
  return sum(a.map((x) => (x - m) ** 2)) / (a.length - 1);
}

function weightedMean(values, weights) {
  let sw = 0, s = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === null || values[i] === undefined) continue;
    s += values[i] * weights[i];
    sw += weights[i];
  }
  return sw > 0 ? s / sw : null;
}

/** Encogimiento bayesiano: (Σw·x + k·prior) / (Σw + k) */
function shrink(values, weights, prior, k) {
  let sw = 0, s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i] * weights[i];
    sw += weights[i];
  }
  return (s + k * prior) / (sw + k);
}

const logFactorialCache = [0];
function logFactorial(n) {
  for (let i = logFactorialCache.length; i <= n; i++) logFactorialCache[i] = logFactorialCache[i - 1] + Math.log(i);
  return logFactorialCache[n];
}

function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(k * Math.log(lambda) - lambda - logFactorial(k));
}

/** P(X > line) para Poisson con línea x.5 */
function poissonOver(line, lambda) {
  const kmax = Math.floor(line);
  let cdf = 0;
  for (let k = 0; k <= kmax; k++) cdf += poissonPmf(k, lambda);
  return clamp(1 - cdf, 0, 1);
}

function logGamma(z) {
  // Aproximación de Lanczos
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Binomial negativa parametrizada por media m y dispersión r (var = m + m²/r). */
function negBinomPmf(k, m, r) {
  const p = r / (r + m);
  return Math.exp(logGamma(k + r) - logGamma(r) - logFactorial(k) + r * Math.log(p) + k * Math.log(1 - p));
}

/**
 * P(X > line) usando Binomial Negativa si hay sobredispersión (var > media),
 * o Poisson si no. Devuelve también la distribución usada.
 */
function countOver(line, m, varianceEstimate) {
  if (varianceEstimate && varianceEstimate > m * 1.05) {
    const r = (m * m) / (varianceEstimate - m);
    let cdf = 0;
    for (let k = 0; k <= Math.floor(line); k++) cdf += negBinomPmf(k, m, r);
    return { p: clamp(1 - cdf, 0, 1), dist: 'negbinom', r };
  }
  return { p: poissonOver(line, m), dist: 'poisson' };
}

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const round = (x, d = 4) => (x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

module.exports = {
  clamp, sum, mean, variance, weightedMean, shrink, logFactorial, poissonPmf, poissonOver,
  negBinomPmf, countOver, logit, sigmoid, round, logGamma,
};
