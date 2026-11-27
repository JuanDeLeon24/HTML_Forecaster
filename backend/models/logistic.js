'use strict';
/**
 * Regresión logística binaria (gradiente descendente) – estructura base v0.5.
 * Estandarización con media/desviación del conjunto de entrenamiento.
 */
function standardize(X) {
  const n = X.length, d = X[0]?.length || 0;
  const mean = Array(d).fill(0), std = Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  for (const row of X) for (let j = 0; j < d; j++) std[j] += (row[j] - mean[j]) ** 2;
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / n) || 1;
  const Z = X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  return { Z, mean, std };
}

function train(X, y, { lr = 0.1, epochs = 1000 } = {}) {
  const { Z, mean, std } = standardize(X);
  const d = Z[0]?.length || 0;
  const w = Array(d).fill(0);
  let b = 0;
  for (let e = 0; e < epochs; e++) {
    const gw = Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < Z.length; i++) {
      const z = Z[i].reduce((s, v, j) => s + v * w[j], 0) + b;
      const p = 1 / (1 + Math.exp(-z));
      const err = p - y[i];
      for (let j = 0; j < d; j++) gw[j] += err * Z[i][j];
      gb += err;
    }
    for (let j = 0; j < d; j++) w[j] -= (lr / Z.length) * gw[j];
    b -= (lr / Z.length) * gb;
  }
  return { w, b, mean, std };
}

function predict(model, X) {
  const { w, b, mean, std } = model;
  return X.map((row) => {
    const z = row.reduce((s, v, j) => s + ((v - mean[j]) / std[j]) * w[j], 0) + b;
    return 1 / (1 + Math.exp(-z));
  });
}

module.exports = { train, predict, standardize };
