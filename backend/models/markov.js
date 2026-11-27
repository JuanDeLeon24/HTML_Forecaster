'use strict';
/**
 * Cadena de Markov simple para estados de partido (diferencia de goles).
 * Transiciones estimadas a partir de incidencias con minuto.
 */
function transitionMatrix(states) {
  const idx = {};
  let n = 0;
  for (const s of states) if (idx[s] === undefined) idx[s] = n++;
  const M = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < states.length - 1; i++) {
    M[idx[states[i]]][idx[states[i + 1]]] += 1;
  }
  for (let i = 0; i < n; i++) {
    const rowSum = M[i].reduce((a, b) => a + b, 0);
    if (rowSum > 0) for (let j = 0; j < n; j++) M[i][j] /= rowSum;
  }
  return { M, idx };
}

module.exports = { transitionMatrix };
