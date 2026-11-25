'use strict';
/**
 * Modelo genérico para conteos del partido (corners, tarjetas):
 *   E[local] = (a_favor_local + en_contra_visitante) / 2
 *   E[visit] = (a_favor_visit + en_contra_local) / 2
 *   E[total] = E[local] + E[visit], mezclado con el H2H si existe.
 * Probabilidad de over: Binomial Negativa si la varianza observada supera la media
 * (sobredispersión típica de corners/tarjetas), Poisson si no.
 */
const config = require('../config');
const { countOver, variance, round } = require('../lib/math');

function countModel(home, away, h2hAvg, h2hN, lines, key, params = config.model) {
  const hp = home[key];
  const ap = away[key];
  if (hp.n < params.minStatsSample || ap.n < params.minStatsSample) {
    return { available: false, reason: `Muestra insuficiente de estadísticas (local ${hp.n}, visitante ${ap.n}; mínimo ${params.minStatsSample})`, homeN: hp.n, awayN: ap.n };
  }
  const eh = (hp.for + ap.against) / 2;
  const ea = (ap.for + hp.against) / 2;
  let total = eh + ea;
  let h2hWeight = 0;
  if (h2hN > 0 && h2hAvg !== null) {
    h2hWeight = 0.2 * (h2hN / (h2hN + 4));
    total = (1 - h2hWeight) * total + h2hWeight * h2hAvg;
  }
  const totals = [...hp.totals, ...ap.totals];
  const v = variance(totals);
  const probs = {};
  let dist = 'poisson';
  for (const line of lines) {
    const r = countOver(line, total, v);
    probs[line] = r.p;
    dist = r.dist;
  }
  return {
    available: true, expected: total, home: eh, away: ea, variance: v, distribution: dist, h2hWeight,
    homeN: hp.n, awayN: ap.n, over: probs,
    summary: `E=${round(total, 2)} (local ${round(eh, 2)}, visitante ${round(ea, 2)}), var=${round(v, 2)}, ${dist}`,
  };
}

module.exports = { countModel };
