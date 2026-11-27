'use strict';
/**
 * Nivel 1 – Modelo de puntuación ponderada (heurístico, transparente).
 *   S = 0.35·Forma + 0.20·H2H + 0.10·Localía + 0.20·Ataque + 0.15·Defensa
 * Cada componente ∈ [−1, 1] desde la perspectiva del local. S se convierte a
 * 1X2 con un logit ordenado: P(1)=σ(a·S−c), P(2)=σ(−a·S−c), P(X)=resto,
 * donde c se fija para que con S=0 la probabilidad de empate sea la tasa base.
 */
const config = require('../config');
const { clamp, sigmoid } = require('../lib/math');

function components({ home, away, h2h }) {
  // Forma: puntos por partido (últimos 5 y 10 combinados) en escala 0–3
  const ppg = (t) => 0.6 * (t.last5.ppg ?? t.all.ppg) + 0.4 * (t.last10.ppg ?? t.all.ppg);
  const form = clamp((ppg(home) - ppg(away)) / 3, -1, 1);

  // H2H: balance de victorias de identidades (no de sede), encogido por tamaño de muestra
  let h2hScore = 0;
  if (h2h.n > 0) h2hScore = ((h2h.homeTeamWins - h2h.awayTeamWins) / h2h.n) * (h2h.n / (h2h.n + 3));

  // Localía: rendimiento del local en casa vs. del visitante fuera
  const venue = clamp(((home.venue.ppg ?? home.all.ppg) - (away.venue.ppg ?? away.all.ppg)) / 3, -1, 1);

  // Ataque y defensa: cociente de fuerzas relativas (log) acotado con tanh
  const attack = Math.tanh(Math.log(home.strength.attack / away.strength.attack));
  const defense = Math.tanh(Math.log(away.strength.defense / home.strength.defense));

  // xG: diferencia de expected goals a favor (si hay datos suficientes)
  let xg = 0;
  if (home.xg?.n >= 3 && away.xg?.n >= 3 && home.xg.for !== null && away.xg.for !== null && away.xg.for > 0) {
    xg = Math.tanh(Math.log(home.xg.for / away.xg.for));
  }

  return { form, h2h: clamp(h2hScore, -1, 1), home: venue, attack, defense, xg };
}

function weightedProbabilities(input, { weights = config.model.weightedFactors, slope = config.model.weightedSlope, drawRate = config.model.baseDrawRate } = {}) {
  const c = components(input);
  const score = Object.keys(weights).reduce((s, k) => s + weights[k] * c[k], 0);
  const cut = Math.log((1 + drawRate) / (1 - drawRate));
  const p1 = sigmoid(slope * score - cut);
  const p2 = sigmoid(-slope * score - cut);
  return { 1: p1, X: Math.max(0, 1 - p1 - p2), 2: p2, score, components: c, weights };
}

module.exports = { weightedProbabilities, components };
