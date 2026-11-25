'use strict';
/** Módulo de explicabilidad: "¿por qué se generó esta predicción?" con cifras reales y su muestra. */
const { round } = require('../lib/math');

const pc = (x) => (x === null || x === undefined ? 'n/d' : `${Math.round(x * 100)}%`);
const f2 = (x) => (x === null || x === undefined ? 'n/d' : round(x, 2));

function explain({ names, home, away, h2h, lambdas, elo, probs, corners, cards }) {
  const reasons = [];
  const fav = probs['1X2']['1'] >= probs['1X2']['2'] ? 'home' : 'away';
  const favName = fav === 'home' ? names.home : names.away;
  const favP = fav === 'home' ? home : away;
  const dogP = fav === 'home' ? away : home;
  const dogName = fav === 'home' ? names.away : names.home;

  reasons.push({
    title: `${favName} parte como favorito (${pc(probs['1X2'][fav === 'home' ? '1' : '2'])})`,
    items: [
      fav === 'home'
        ? `${names.home} ganó ${favP.venue.wins} de ${favP.venue.n} partidos como local (${pc(favP.venue.n ? favP.venue.wins / favP.venue.n : null)}).`
        : `${names.away} ganó ${favP.venue.wins} de ${favP.venue.n} partidos como visitante (${pc(favP.venue.n ? favP.venue.wins / favP.venue.n : null)}).`,
      `Forma últimos 5: ${names.home} ${home.form || 'n/d'} (${f2(home.last5.ppg)} pts/p) · ${names.away} ${away.form || 'n/d'} (${f2(away.last5.ppg)} pts/p).`,
      `Goles a favor/en contra (últ. ${favP.last10.n}): ${favName} ${f2(favP.last10.goalsFor)} / ${f2(favP.last10.goalsAgainst)} · ${dogName} ${f2(dogP.last10.goalsFor)} / ${f2(dogP.last10.goalsAgainst)}.`,
    ],
  });

  if (elo && elo.home.games >= 5 && elo.away.games >= 5) {
    const diff = Math.round(elo.home.elo - elo.away.elo);
    reasons[0].items.push(diff >= 0
      ? `Elo de ${names.home} superior por ${diff} puntos (${Math.round(elo.home.elo)} vs ${Math.round(elo.away.elo)}).`
      : `Elo de ${names.away} superior por ${-diff} puntos (${Math.round(elo.away.elo)} vs ${Math.round(elo.home.elo)}).`);
  }

  reasons.push({
    title: `Goles esperados (Poisson + Dixon-Coles): ${f2(lambdas.home)} – ${f2(lambdas.away)}`,
    items: [
      `Over 2.5 en últimos 10: ${names.home} ${pc(home.last10.over25)} · ${names.away} ${pc(away.last10.over25)}. Modelo: ${pc(probs.OU.over[2.5])}.`,
      `Ambos anotan en últimos 10: ${names.home} ${pc(home.last10.btts)} · ${names.away} ${pc(away.last10.btts)}. Modelo: ${pc(probs.BTTS.yes)}.`,
      `Fuerza ofensiva relativa: ${f2(home.strength.attack)} vs ${f2(away.strength.attack)} · defensiva (menor = mejor): ${f2(home.strength.defense)} vs ${f2(away.strength.defense)}.`,
    ],
  });

  if (h2h.n > 0) {
    reasons.push({
      title: `Head to Head (últimos ${h2h.n})`,
      items: [
        `${names.home} ${h2h.homeTeamWins} · Empates ${h2h.draws} · ${names.away} ${h2h.awayTeamWins}.`,
        `Promedio de goles ${f2(h2h.avgGoals)} · BTTS ${pc(h2h.btts)} · Over 2.5 ${pc(h2h.over25)}.`,
        h2h.cornersN ? `Corners promedio ${f2(h2h.avgCorners)} (n=${h2h.cornersN}) · Más de 8.5: ${pc(h2h.over85Corners)}.` : 'Sin estadísticas de corners en el H2H.',
      ],
    });
  }

  if (corners.available || cards.available) {
    reasons.push({
      title: 'Corners y tarjetas',
      items: [
        corners.available ? `Corners esperados ${f2(corners.expected)} (${corners.distribution}; muestras ${corners.homeN}/${corners.awayN}).` : corners.reason,
        cards.available ? `Tarjetas esperadas ${f2(cards.expected)} (${cards.distribution}; muestras ${cards.homeN}/${cards.awayN}). El árbitro aún no se modela.` : cards.reason,
      ],
    });
  }
  return reasons;
}

module.exports = { explain };
