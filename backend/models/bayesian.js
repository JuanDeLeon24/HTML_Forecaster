'use strict';
/**
 * Actualización bayesiana Gamma-Poisson para tasas de gol.
 * Prior Gamma(alpha, beta), likelihood Poisson -> posterior Gamma(alpha+goals, beta+n).
 */
function posteriorRate(goals, n, alpha = 1, beta = 1) {
  const a = alpha + goals;
  const b = beta + n;
  return { alpha: a, beta: b, mean: a / b, variance: a / (b * b) };
}

function blendRate(priorMean, observedGoals, n, k = 3) {
  return (observedGoals + k * priorMean) / (n + k);
}

module.exports = { posteriorRate, blendRate };
