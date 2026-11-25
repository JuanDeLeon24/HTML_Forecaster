'use strict';
/**
 * Nivel 2 – Elo.
 *  - Elo general: estilo World Football Elo (K ajustado por diferencia de goles, ventaja local).
 *  - Elo ofensivo / defensivo: ratings de goles. Goles esperados del local =
 *    base · 10^((atkLocal − defVisitante)/400); se actualizan con K·(goles − esperados).
 * Se recalcula desde cero en orden cronológico con todos los partidos de la base,
 * por lo que es reproducible y no depende del orden de recolección.
 */
const config = require('../config');
const { clamp } = require('../lib/math');

function goalMultiplier(diff) {
  const d = Math.abs(diff);
  if (d <= 1) return 1;
  if (d === 2) return 1.5;
  return (11 + d) / 8;
}

function expectedScore(rHome, rAway, homeAdv) {
  return 1 / (1 + 10 ** (-(rHome + homeAdv - rAway) / 400));
}

/**
 * @param {Array} matches [{home_team_id, away_team_id, home_goals, away_goals, start_time}] ordenados por fecha
 */
function computeRatings(matches, { k = config.model.eloK, homeAdv = config.model.eloHomeAdvantage, initial = config.model.eloInitial, goalK = 8, baseGoals = 1.35 } = {}) {
  const r = new Map();
  const get = (id) => {
    if (!r.has(id)) r.set(id, { elo: initial, atk: initial, def: initial, games: 0, lastPlayed: null });
    return r.get(id);
  };
  for (const m of matches) {
    const h = get(m.home_team_id);
    const a = get(m.away_team_id);
    const e = expectedScore(h.elo, a.elo, homeAdv);
    const s = m.home_goals > m.away_goals ? 1 : m.home_goals === m.away_goals ? 0.5 : 0;
    const delta = k * goalMultiplier(m.home_goals - m.away_goals) * (s - e);
    h.elo += delta;
    a.elo -= delta;

    const expH = baseGoals * 1.1 * 10 ** ((h.atk - a.def) / 400);
    const expA = baseGoals * 0.9 * 10 ** ((a.atk - h.def) / 400);
    const dh = goalK * clamp(m.home_goals - expH, -3, 3);
    const da = goalK * clamp(m.away_goals - expA, -3, 3);
    h.atk += dh; a.def -= dh;
    a.atk += da; h.def -= da;
    h.games += 1; a.games += 1;
    h.lastPlayed = a.lastPlayed = m.start_time;
  }
  return r;
}

/**
 * Convierte diferencia Elo en 1X2. El empate se modela con una campana centrada en
 * partidos parejos cuya altura es la tasa de empates observada (drawRate).
 */
function eloProbabilities(rHome, rAway, { homeAdv = config.model.eloHomeAdvantage, drawRate = config.model.baseDrawRate } = {}) {
  const e = expectedScore(rHome, rAway, homeAdv);
  const pDraw = clamp(drawRate * 1.12 * Math.exp(-(((e - 0.5) / 0.32) ** 2)), 0.05, 0.4);
  let pHome = e - pDraw / 2;
  let pAway = 1 - e - pDraw / 2;
  pHome = Math.max(0.01, pHome);
  pAway = Math.max(0.01, pAway);
  const t = pHome + pDraw + pAway;
  return { 1: pHome / t, X: pDraw / t, 2: pAway / t, expected: e };
}

module.exports = { computeRatings, eloProbabilities, expectedScore, goalMultiplier };
