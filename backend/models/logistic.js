'use strict';
/**
 * Modelo 11 – Regresión logística multinomial (softmax) para el 1X2.
 * Entrena con descenso de gradiente y regularización L2 sobre características calculadas ANTES
 * de cada partido (guardadas en el pronóstico) y su resultado real. Las características se
 * estandarizan con media/desviación del conjunto de entrenamiento (sin mirar validación).
 */

const CLASSES = ['1', 'X', '2'];

/** Vector de características de un pronóstico (todas conocidas antes del inicio). */
function featuresOf(output) {
  const m = output.models || {};
  const f = output.features || {};
  const pick = (p, k) => (p && Number.isFinite(p[k]) ? p[k] : null);
  const v = [
    pick(m.poisson, '1') - pick(m.poisson, '2'),
    pick(m.poisson, 'X'),
    m.elo ? m.elo['1'] - m.elo['2'] : 0,
    m.weighted ? m.weighted.score : 0,
    m.xg ? m.xg['1'] - m.xg['2'] : 0,
    f.lambdaDiff ?? 0,
    f.lambdaTotal ?? 0,
    f.formDiff ?? 0,
    f.restDiff ?? 0,
    f.positionDiff ?? 0,
  ];
  return v.every((x) => x !== null && Number.isFinite(x)) ? v : null;
}
const FEATURE_NAMES = ['Poisson 1−2', 'Poisson X', 'Elo 1−2', 'Ponderado S', 'xG 1−2', 'Δλ', 'λ total', 'Δ forma', 'Δ descanso', 'Δ posición'];

function softmax(z) {
  const mx = Math.max(...z);
  const e = z.map((x) => Math.exp(x - mx));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

function standardizer(X) {
  const d = X[0].length;
  const mu = Array(d).fill(0);
  const sd = Array(d).fill(0);
  for (const x of X) for (let j = 0; j < d; j++) mu[j] += x[j] / X.length;
  for (const x of X) for (let j = 0; j < d; j++) sd[j] += (x[j] - mu[j]) ** 2 / X.length;
  for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  return { mu, sd };
}

/**
 * @param X matriz n×d  @param y etiquetas '1'|'X'|'2'
 * @returns modelo { W (3×(d+1)), mu, sd }
 */
function train(X, y, { l2 = 1.0, lr = 0.1, epochs = 400 } = {}) {
  const { mu, sd } = standardizer(X);
  const Z = X.map((x) => [1, ...x.map((v, j) => (v - mu[j]) / sd[j])]);
  const d = Z[0].length;
  const W = CLASSES.map(() => Array(d).fill(0));
  const Y = y.map((c) => CLASSES.map((k) => (k === c ? 1 : 0)));
  const n = Z.length;
  for (let ep = 0; ep < epochs; ep++) {
    const G = CLASSES.map(() => Array(d).fill(0));
    for (let i = 0; i < n; i++) {
      const p = softmax(W.map((w) => w.reduce((a, wj, j) => a + wj * Z[i][j], 0)));
      for (let c = 0; c < 3; c++) for (let j = 0; j < d; j++) G[c][j] += (p[c] - Y[i][c]) * Z[i][j] / n;
    }
    for (let c = 0; c < 3; c++) for (let j = 0; j < d; j++) W[c][j] -= lr * (G[c][j] + (j > 0 ? (l2 * W[c][j]) / n : 0));
  }
  return { W, mu, sd, features: FEATURE_NAMES };
}

function predict(model, x) {
  const z = [1, ...x.map((v, j) => (v - model.mu[j]) / model.sd[j])];
  const p = softmax(model.W.map((w) => w.reduce((a, wj, j) => a + wj * z[j], 0)));
  return { 1: p[0], X: p[1], 2: p[2] };
}

/** Importancia global: |coeficiente estandarizado| promedio entre clases (comparable entre variables). */
function importance(model) {
  return model.features.map((name, j) => ({
    feature: name, weight: (Math.abs(model.W[0][j + 1]) + Math.abs(model.W[1][j + 1]) + Math.abs(model.W[2][j + 1])) / 3,
  })).sort((a, b) => b.weight - a.weight);
}

module.exports = { train, predict, featuresOf, importance, FEATURE_NAMES, CLASSES };
