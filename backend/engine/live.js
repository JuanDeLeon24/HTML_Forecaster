'use strict';

function estimateMinute(match, incidents) {
  const mins = (incidents || []).map((i) => i.minute).filter((m) => Number.isFinite(m));
  return mins.length ? Math.max(...mins) : null;
}

function analyzeLive(match, stats, incidents) {
  const has = !!(stats && stats.available === 1);
  const corners = has && stats.home_corners !== null && stats.away_corners !== null
    ? stats.home_corners + stats.away_corners : null;
  const cards = has && stats.home_yellow !== null && stats.away_yellow !== null
    ? stats.home_yellow + stats.away_yellow + (stats.home_red ?? 0) + (stats.away_red ?? 0) : null;
  const minute = estimateMinute(match, incidents);
  const recs = [];
  if (corners !== null) {
    if (corners >= 9) recs.push('Corners: ya superado Over 8.5');
    else if (corners >= 7 && (minute === null || minute < 75)) recs.push('Corners: tendencia Over 8.5');
    if (corners <= 4 && minute && minute > 60) recs.push('Corners: posible Under 8.5');
  }
  if (cards !== null) {
    if (cards >= 4) recs.push('Tarjetas: ya superado Over 3.5');
    else if (cards >= 2 && (minute === null || minute < 75)) recs.push('Tarjetas: posible Over 3.5');
  }
  if (match.home_goals !== null && match.away_goals !== null) {
    if (match.home_goals === match.away_goals) recs.push('Marcador empatado: X / DC 1X-X2');
    else if (match.home_goals > match.away_goals) recs.push('Gana el local en este momento');
    else recs.push('Gana el visitante en este momento');
  }
  if (minute && minute >= 75) {
    const hg = match.home_goals ?? 0, ag = match.away_goals ?? 0;
    if (hg === ag) recs.push('Final de partido: valor en Empate o Under goles');
  }
  return { minute, corners, cards, recommendations: recs };
}

module.exports = { analyzeLive, estimateMinute };
