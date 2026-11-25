'use strict';
/**
 * Combinador de eventos.
 * - Legs de goles (1X2, DC, OU, BTTS, TEAM_OU): probabilidad conjunta EXACTA sumando
 *   las celdas de la matriz de marcadores que cumplen todos los predicados
 *   (captura la correlación real, p. ej. "gana local" y "over 2.5").
 * - Corners / tarjetas: se multiplican asumiendo independencia respecto a los goles
 *   y entre sí (supuesto declarado explícitamente en la salida).
 */
const { FAMILY, label, scorePredicate, legKey } = require('./markets');

function marginal(output, leg) {
  const p = output.probabilities;
  switch (leg.market) {
    case '1X2': return p['1X2'][leg.selection];
    case 'DC': return p.DC[leg.selection];
    case 'OU': return leg.selection === 'over' ? p.OU.over[leg.line] : 1 - p.OU.over[leg.line];
    case 'BTTS': return p.BTTS[leg.selection];
    case 'TEAM_OU': return p.TEAM_OU[leg.selection]?.[leg.line];
    case 'CORNERS': return p.CORNERS ? (leg.selection === 'over' ? p.CORNERS.over[leg.line] : 1 - p.CORNERS.over[leg.line]) : undefined;
    case 'CARDS': return p.CARDS ? (leg.selection === 'over' ? p.CARDS.over[leg.line] : 1 - p.CARDS.over[leg.line]) : undefined;
    default: return undefined;
  }
}

function jointProbability(output, legs) {
  const matrix = output.scoreMatrix;
  const goalPreds = [];
  const others = [];
  const individual = [];
  for (const leg of legs) {
    const m = marginal(output, leg);
    if (m === undefined || m === null) return { available: false, reason: `Mercado sin pronóstico disponible: ${legKey(leg)}` };
    individual.push({ ...leg, probability: m });
    const pred = scorePredicate(leg);
    if (pred) goalPreds.push(pred); else others.push(m);
  }
  let pGoals = 1;
  if (goalPreds.length) {
    pGoals = 0;
    for (let h = 0; h < matrix.length; h++) for (let a = 0; a < matrix[h].length; a++) {
      if (goalPreds.every((f) => f(h, a))) pGoals += matrix[h][a];
    }
  }
  const joint = others.reduce((x, y) => x * y, pGoals);
  const naive = individual.reduce((x, l) => x * l.probability, 1);
  return {
    available: true,
    individual,
    joint,
    naiveProduct: naive,
    correlationLift: naive > 0 ? joint / naive : null,
    risk: joint >= 0.7 ? 'bajo' : joint >= 0.5 ? 'medio' : 'alto',
    fairOdds: joint > 0 ? 1 / joint : null,
    assumptions: others.length ? ['Corners/tarjetas tratados como independientes de los goles.'] : [],
  };
}

const CANDIDATE_LEGS = [
  { market: '1X2', selection: '1' }, { market: '1X2', selection: '2' },
  { market: 'DC', selection: '1X' }, { market: 'DC', selection: 'X2' },
  { market: 'OU', selection: 'over', line: 1.5 }, { market: 'OU', selection: 'over', line: 2.5 },
  { market: 'OU', selection: 'under', line: 3.5 }, { market: 'OU', selection: 'under', line: 2.5 },
  { market: 'BTTS', selection: 'yes' }, { market: 'BTTS', selection: 'no' },
  { market: 'CORNERS', selection: 'over', line: 8.5 }, { market: 'CORNERS', selection: 'under', line: 10.5 },
  { market: 'CARDS', selection: 'over', line: 3.5 }, { market: 'CARDS', selection: 'under', line: 4.5 },
];

/** Genera combinaciones de 2 y 3 legs de familias distintas, ordenadas por probabilidad conjunta. */
function suggestCombinations(output, { minJoint = 0.45, maxLegP = 0.95, top = 5 } = {}) {
  const legs = CANDIDATE_LEGS.map((l) => ({ ...l, line: l.line ?? 0 }))
    .map((l) => ({ leg: l, p: marginal(output, l) }))
    .filter((x) => x.p !== undefined && x.p !== null && x.p >= 0.5 && x.p <= maxLegP)
    .map((x) => x.leg);
  const combos = [];
  const fam = (l) => FAMILY[l.market];
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      if (fam(legs[i]) === fam(legs[j])) continue;
      combos.push([legs[i], legs[j]]);
      for (let k = j + 1; k < legs.length; k++) {
        if (fam(legs[k]) === fam(legs[i]) || fam(legs[k]) === fam(legs[j])) continue;
        combos.push([legs[i], legs[j], legs[k]]);
      }
    }
  }
  const names = { home: output.match.home, away: output.match.away };
  return combos
    .map((legsC) => ({ legs: legsC, ...jointProbability(output, legsC) }))
    .filter((c) => c.available && c.joint >= minJoint)
    // Se prefieren combinaciones con más legs a igualdad aproximada de probabilidad
    .sort((a, b) => b.joint * (1 + 0.04 * b.legs.length) - a.joint * (1 + 0.04 * a.legs.length))
    .slice(0, top)
    .map((c) => ({ ...c, label: c.legs.map((l) => label(l, names)).join(' + ') }));
}

module.exports = { jointProbability, suggestCombinations, marginal, CANDIDATE_LEGS };
