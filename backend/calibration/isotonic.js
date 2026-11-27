'use strict';
function isotonicCalibrate(probabilities, labels) {
  const n = probabilities.length;
  if (n === 0) return [];
  const order = probabilities.map((_, i) => i).sort((a, b) => probabilities[a] - probabilities[b]);
  const groups = order.map((i) => ({ sumY: labels[i], n: 1, indices: [i] }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < groups.length - 1; i++) {
      const a = groups[i], b = groups[i + 1];
      if (a.sumY / a.n > b.sumY / b.n + 1e-12) {
        groups.splice(i, 2, { sumY: a.sumY + b.sumY, n: a.n + b.n, indices: a.indices.concat(b.indices) });
        changed = true;
        i = Math.max(-1, i - 1);
      }
    }
  }
  const out = new Array(n);
  for (const g of groups) {
    const val = g.sumY / g.n;
    for (const idx of g.indices) out[idx] = val;
  }
  return out;
}
module.exports = { isotonicCalibrate };
