'use strict';
/**
 * Goles esperados (λ) para Poisson / Dixon-Coles.
 *   λlocal = μ · Ataque_local · Defensa_visitante · h
 *   λvisit = μ · Ataque_visit · Defensa_local / h
 * μ = goles medios por equipo y partido del pool; h = √(media local / media visitante).
 * Ajuste H2H opcional sobre el TOTAL de goles (peso máx. config.h2hGoalsWeight, encogido por muestra).
 */
const config = require('../config');
const { clamp } = require('../lib/math');

function expectedGoals(home, away, h2h, params = config.model) {
  const { mu, homeFactor: h } = home.strength;
  let lh = mu * home.strength.attack * away.strength.defense * h;
  let la = mu * away.strength.attack * home.strength.defense / h;
  const base = { home: lh, away: la };
  let h2hWeight = 0;
  if (h2h.n > 0 && h2h.avgGoals !== null) {
    h2hWeight = params.h2hGoalsWeight * (h2h.n / (h2h.n + 5));
    const total = lh + la;
    const adjusted = (1 - h2hWeight) * total + h2hWeight * h2h.avgGoals;
    lh *= adjusted / total;
    la *= adjusted / total;
  }
  return {
    home: clamp(lh, 0.1, 5), away: clamp(la, 0.1, 5),
    base, h2hWeight, mu, homeFactor: h,
  };
}

module.exports = { expectedGoals };
