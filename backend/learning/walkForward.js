'use strict';
/**
 * Validación temporal walk-forward (expanding/rolling) para evitar sobreajuste.
 * Devuelve métricas por fold sin look-ahead.
 */
function walkForward(samples, { trainSize = 0.6, folds = 5, mode = 'expanding' } = {}) {
  const n = samples.length;
  const foldSize = Math.floor(n / folds);
  const results = [];
  for (let f = 1; f < folds; f++) {
    const trainEnd = mode === 'expanding' ? f * foldSize : Math.min(n, (f + 1) * foldSize);
    const testStart = trainEnd;
    const testEnd = Math.min(n, testStart + foldSize);
    if (testEnd <= testStart) continue;
    results.push({ fold: f, trainRange: [0, trainEnd], testRange: [testStart, testEnd], trainSize: trainEnd, testSize: testEnd - testStart });
  }
  return results;
}

module.exports = { walkForward };
