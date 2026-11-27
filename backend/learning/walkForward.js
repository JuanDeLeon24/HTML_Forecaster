'use strict';
/**
 * Validación temporal sin fuga de información.
 *  - expanding window: entrenar con [0, i), evaluar en el bloque siguiente; la ventana crece.
 *  - rolling window: entrenar con los últimos `window` antes del bloque; la ventana se desplaza.
 * Las observaciones DEBEN estar ordenadas cronológicamente; nunca se usa un dato posterior para entrenar.
 */
function splits(n, { folds = 3, mode = 'expanding', minTrain = 30, window = null } = {}) {
  const out = [];
  if (n < minTrain + folds) return out;
  const block = Math.floor((n - minTrain) / folds);
  for (let f = 0; f < folds; f++) {
    const testStart = minTrain + f * block;
    const testEnd = f === folds - 1 ? n : testStart + block;
    const trainStart = mode === 'rolling' && window ? Math.max(0, testStart - window) : 0;
    out.push({ train: [trainStart, testStart], test: [testStart, testEnd] });
  }
  return out;
}

/** Diferencial pareado (mejora > 0 = el candidato es mejor): media, error estándar y t. */
function pairedImprovement(lossBase, lossCand) {
  const d = lossBase.map((b, i) => b - lossCand[i]);
  const n = d.length;
  if (!n) return { n: 0, mean: 0, se: 0, t: 0 };
  const mean = d.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const se = sd / Math.sqrt(n);
  return { n, mean, se, t: se > 0 ? mean / se : 0 };
}

/**
 * Deriva: compara el error reciente con el histórico (prueba z de medias).
 * @param losses pérdidas ordenadas en el tiempo
 */
function detectDrift(losses, { recent = 50, minHistory = 100 } = {}) {
  if (losses.length < recent + minHistory) return { drift: false, reason: 'muestra insuficiente', n: losses.length };
  const r = losses.slice(-recent);
  const h = losses.slice(0, -recent);
  const m = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const v = (a, mu) => a.reduce((x, y) => x + (y - mu) ** 2, 0) / Math.max(1, a.length - 1);
  const mr = m(r), mh = m(h);
  const z = (mr - mh) / Math.sqrt(v(r, mr) / r.length + v(h, mh) / h.length || 1e-12);
  return { drift: z > 2, z, recentLoss: mr, historicalLoss: mh, n: losses.length };
}

module.exports = { splits, pairedImprovement, detectDrift };
