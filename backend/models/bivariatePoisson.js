'use strict';
/**
 * Modelo 2 – Poisson bivariado (Karlis & Ntzoufras, 2003).
 *   X = W1 + W3, Y = W2 + W3, Wi ~ Poisson(λi) independientes
 *   P(x,y) = e^{-(λ1+λ2+λ3)} · λ1^x/x! · λ2^y/y! · Σ_{k=0}^{min(x,y)} C(x,k)·C(y,k)·k!·(λ3/(λ1·λ2))^k
 * λ3 = covarianza entre goles de ambos equipos. Se conservan las medias del modelo base:
 * λ1 = λlocal − λ3, λ2 = λvisitante − λ3.
 */
const { logFactorial } = require('../lib/math');

function bivariatePmf(x, y, l1, l2, l3) {
  let s = 0;
  const ratio = l3 / (l1 * l2);
  for (let k = 0; k <= Math.min(x, y); k++) {
    s += Math.exp(logFactorial(x) - logFactorial(k) - logFactorial(x - k) + logFactorial(y) - logFactorial(k) - logFactorial(y - k) + logFactorial(k) + k * Math.log(ratio));
  }
  return Math.exp(-(l1 + l2 + l3) + x * Math.log(l1) - logFactorial(x) + y * Math.log(l2) - logFactorial(y)) * s;
}

function bivariateMatrix(lambdaHome, lambdaAway, { lambda3 = 0.1, maxGoals = 10 } = {}) {
  const l3 = Math.max(0, Math.min(lambda3, 0.9 * Math.min(lambdaHome, lambdaAway)));
  const l1 = lambdaHome - l3;
  const l2 = lambdaAway - l3;
  const m = [];
  let total = 0;
  for (let x = 0; x <= maxGoals; x++) {
    m[x] = [];
    for (let y = 0; y <= maxGoals; y++) {
      m[x][y] = l3 > 0 ? bivariatePmf(x, y, l1, l2, l3) : Math.exp(-(l1 + l2) + x * Math.log(l1) - logFactorial(x) + y * Math.log(l2) - logFactorial(y));
      total += m[x][y];
    }
  }
  for (let x = 0; x <= maxGoals; x++) for (let y = 0; y <= maxGoals; y++) m[x][y] /= total;
  return { matrix: m, lambda3: l3 };
}

module.exports = { bivariateMatrix, bivariatePmf };
