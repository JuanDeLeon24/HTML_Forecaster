'use strict';
/** Regresión isotónica (Pool Adjacent Violators): mapa monótono no decreciente p → frecuencia observada. */
function fitIsotonic(points) {
  const pts = points.slice().sort((a, b) => a.p - b.p);
  const blocks = [];
  for (const { p, o } of pts) {
    blocks.push({ sumP: p, sumO: o, n: 1, lo: p, hi: p });
    while (blocks.length > 1 && blocks[blocks.length - 2].sumO / blocks[blocks.length - 2].n > blocks[blocks.length - 1].sumO / blocks[blocks.length - 1].n) {
      const b = blocks.pop();
      const a = blocks[blocks.length - 1];
      a.sumP += b.sumP; a.sumO += b.sumO; a.n += b.n; a.hi = b.hi;
    }
  }
  // Se guardan los centros de cada bloque para interpolar linealmente entre ellos
  return { method: 'isotonic', xs: blocks.map((b) => b.sumP / b.n), ys: blocks.map((b) => b.sumO / b.n) };
}

function applyIsotonic(model, p) {
  const { xs, ys } = model;
  if (!xs.length) return p;
  if (p <= xs[0]) return clampP(ys[0]);
  if (p >= xs[xs.length - 1]) return clampP(ys[ys.length - 1]);
  let i = 1;
  while (xs[i] < p) i++;
  const t = (p - xs[i - 1]) / (xs[i] - xs[i - 1] || 1);
  return clampP(ys[i - 1] + t * (ys[i] - ys[i - 1]));
}

// Nunca 0 ni 1 exactos: un evento "imposible" que ocurre destruiría el log loss
const clampP = (p) => Math.min(0.995, Math.max(0.005, p));

module.exports = { fitIsotonic, applyIsotonic, clampP };
