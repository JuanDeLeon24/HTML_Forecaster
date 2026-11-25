'use strict';
/**
 * "¿Por qué falló?" – análisis post-partido basado SOLO en datos registrados:
 * marcador, estadísticas (xG, tiros, corners, tarjetas) e incidencias (expulsiones,
 * penales fallados, goles tempranos). No se infieren lesiones ni rotaciones sin datos.
 */
const { round } = require('../lib/math');

function analyze({ forecast, result, stats, incidents, settled }) {
  const o = forecast.output;
  const expectedTotal = o.lambdas ? o.lambdas.home + o.lambdas.away : null;
  const actualTotal = result.homeGoals + result.awayGoals;
  const causes = [];

  for (const i of incidents.filter((x) => x.type === 'red_card')) {
    const team = i.side === 'home' ? o.match.home : i.side === 'away' ? o.match.away : 'equipo desconocido';
    causes.push({ type: 'red_card', text: `Expulsión al minuto ${i.minute ?? '?'} (${team}${i.player ? ', ' + i.player : ''}).` });
  }
  for (const i of incidents.filter((x) => x.type === 'penalty_miss')) {
    causes.push({ type: 'penalty_miss', text: `Penal fallado al minuto ${i.minute ?? '?'} (${i.side === 'home' ? o.match.home : o.match.away}).` });
  }
  const early = incidents.filter((x) => x.type === 'goal' && x.minute !== null && x.minute <= 15);
  if (early.length) causes.push({ type: 'early_goal', text: `Gol temprano (min ${early.map((g) => g.minute).join(', ')}) que condicionó el desarrollo.` });

  if (stats?.available && stats.home_xg !== null && stats.away_xg !== null) {
    const xgTotal = stats.home_xg + stats.away_xg;
    if (Math.abs(xgTotal - actualTotal) >= 1.5) {
      causes.push({ type: 'finishing_variance', text: `xG total ${round(xgTotal, 2)} vs ${actualTotal} goles reales: varianza de definición (${actualTotal < xgTotal ? 'baja' : 'alta'} eficiencia).` });
    }
    if (expectedTotal !== null && Math.abs(xgTotal - expectedTotal) >= 1.2) {
      causes.push({ type: 'game_profile', text: `El partido generó ${round(xgTotal, 2)} xG frente a ${round(expectedTotal, 2)} goles esperados: el perfil del juego difirió del histórico.` });
    }
  }

  const failed = settled.filter((p) => p.outcome === 0 && p.probability >= 0.6);
  const hits = settled.filter((p) => p.outcome === 1 && p.probability >= 0.5).length;
  const graded = settled.filter((p) => p.probability >= 0.5).length;
  return {
    analyzedAt: Math.floor(Date.now() / 1000),
    expected: { goals: expectedTotal !== null ? round(expectedTotal, 2) : null, corners: o.corners?.expected ?? null, cards: o.cards?.expected ?? null },
    actual: {
      score: `${result.homeGoals}-${result.awayGoals}`, goals: actualTotal, corners: result.corners, cards: result.cards,
      xg: stats?.available && stats.home_xg !== null ? `${round(stats.home_xg, 2)} - ${round(stats.away_xg, 2)}` : null,
    },
    error: { goalsAbs: expectedTotal !== null ? round(Math.abs(actualTotal - expectedTotal), 2) : null, goalsPct: expectedTotal ? round(Math.abs(actualTotal - expectedTotal) / expectedTotal, 3) : null },
    hitRateHighProb: graded ? round(hits / graded, 3) : null,
    pickOutcome: settled.find((p) => p.is_pick)?.outcome ?? null,
    failedHighConfidence: failed.map((p) => ({ market: p.market, selection: p.selection, line: p.line, probability: p.probability })),
    causes,
    note: causes.length ? null : 'No se detectaron causas en los datos disponibles (lesiones/rotaciones requieren alineaciones: Fase 3).',
  };
}

module.exports = { analyze };
