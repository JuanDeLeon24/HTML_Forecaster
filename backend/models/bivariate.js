'use strict';
function fact(n) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }

function bivariatePmf(x, y, l1, l2, l3) {
  if (l1 <= 0 || l2 <= 0 || l3 < 0) return 0;
  let sum = 0;
  const maxk = Math.min(x, y);
  for (let k = 0; k <= maxk; k++) {
    sum += (fact(x) * fact(y)) / (fact(k) * fact(x - k) * fact(y - k)) * Math.pow(l3, k);
  }
  const p = Math.exp(-(l1 + l2 + l3)) * Math.pow(l1, x) * Math.pow(l2, y) / (fact(x) * fact(y)) * sum;
  return Math.max(0, p);
}

function bivariateMatrix(l1, l2, l3, maxGoals = 10) {
  const m = [];
  let total = 0;
  for (let x = 0; x <= maxGoals; x++) {
    m[x] = [];
    for (let y = 0; y <= maxGoals; y++) {
      m[x][y] = bivariatePmf(x, y, l1, l2, l3);
      total += m[x][y];
    }
  }
  for (let x = 0; x <= maxGoals; x++) for (let y = 0; y <= maxGoals; y++) m[x][y] /= total;
  return m;
}

module.exports = { bivariatePmf, bivariateMatrix };
