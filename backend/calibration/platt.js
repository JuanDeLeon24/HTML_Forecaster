'use strict';
/** Platt scaling sobre el logit: p' = σ(a·logit(p) + b), ajustado por máxima verosimilitud (Newton-Raphson). */
const { clampP } = require('./isotonic');

const logit = (p) => Math.log(clampP(p) / (1 - clampP(p)));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

function fitPlatt(points, { iterations = 50 } = {}) {
  let a = 1;
  let b = 0;
  for (let it = 0; it < iterations; it++) {
    let g1 = 0, g2 = 0, h11 = 0, h12 = 0, h22 = 0;
    for (const { p, o } of points) {
      const x = logit(p);
      const q = sigmoid(a * x + b);
      const w = q * (1 - q);
      g1 += (q - o) * x; g2 += q - o;
      h11 += w * x * x; h12 += w * x; h22 += w;
    }
    h11 += 1e-6; h22 += 1e-6;
    const det = h11 * h22 - h12 * h12;
    if (Math.abs(det) < 1e-12) break;
    const da = (h22 * g1 - h12 * g2) / det;
    const db = (h11 * g2 - h12 * g1) / det;
    a -= da; b -= db;
    if (Math.abs(da) + Math.abs(db) < 1e-8) break;
  }
  return { method: 'platt', a, b };
}

const applyPlatt = (m, p) => clampP(sigmoid(m.a * logit(p) + m.b));

module.exports = { fitPlatt, applyPlatt, logit };
