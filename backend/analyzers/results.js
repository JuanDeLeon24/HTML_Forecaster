'use strict';
/** Ensamble del 1X2: mezcla ponderada de Poisson-DC, Elo y modelo ponderado. */

function blend1X2(models, weights) {
  const out = { 1: 0, X: 0, 2: 0 };
  let tw = 0;
  for (const [name, w] of Object.entries(weights)) {
    const p = models[name];
    if (!p || !w) continue;
    for (const k of ['1', 'X', '2']) out[k] += w * p[k];
    tw += w;
  }
  for (const k of ['1', 'X', '2']) out[k] /= tw;
  return out;
}

module.exports = { blend1X2 };
