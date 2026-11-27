'use strict';
/**
 * Modelo de árbol simple (stump) – estructura base para Random Forest/GBM.
 * Convierte el score ponderado en probabilidades con umbrales discretos.
 */
function treeProbabilities(weighted) {
  const s = weighted?.score ?? 0;
  let p1, p2;
  if (s > 0.4) { p1 = 0.62; p2 = 0.18; }
  else if (s > 0.1) { p1 = 0.48; p2 = 0.27; }
  else if (s < -0.4) { p1 = 0.18; p2 = 0.62; }
  else if (s < -0.1) { p1 = 0.27; p2 = 0.48; }
  else { p1 = 0.34; p2 = 0.33; }
  const pX = Math.max(0, 1 - p1 - p2);
  return { 1: p1, X: pX, 2: p2 };
}

module.exports = { treeProbabilities };
