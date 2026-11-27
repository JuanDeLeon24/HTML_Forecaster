'use strict';
/**
 * Perfil estadístico de un equipo a partir de sus últimos partidos reales.
 * Ventanas: 5, 10, 20, 50 partidos + filtro por sede (casa/fuera).
 * Todas las cifras llevan su tamaño de muestra (n / statsN).
 */
const config = require('../config');
const { mean, shrink, variance } = require('../lib/math');

/** Normaliza una fila de partido desde la perspectiva de `teamId`. */
function perspective(row, teamId) {
  const isHome = row.home_team_id === teamId;
  const hasStats = row.stats_available === 1;
  const pick = (h, a) => (isHome ? h : a);
  const statOrNull = (h, a) => (hasStats && h !== null && a !== null ? pick(h, a) : null);
  const cardsH = hasStats && row.home_yellow !== null ? row.home_yellow + (row.home_red ?? 0) : null;
  const cardsA = hasStats && row.away_yellow !== null ? row.away_yellow + (row.away_red ?? 0) : null;
  const gf = pick(row.home_goals, row.away_goals);
  const ga = pick(row.away_goals, row.home_goals);
  return {
    matchId: row.id, startTime: row.start_time, isHome, gf, ga,
    opponentId: pick(row.away_team_id, row.home_team_id),
    result: gf > ga ? 'W' : gf === ga ? 'D' : 'L',
    cornersFor: statOrNull(row.home_corners, row.away_corners),
    cornersAgainst: statOrNull(row.away_corners, row.home_corners),
    cardsFor: cardsH !== null && cardsA !== null ? pick(cardsH, cardsA) : null,
    cardsAgainst: cardsH !== null && cardsA !== null ? pick(cardsA, cardsH) : null,
    xgFor: statOrNull(row.home_xg, row.away_xg),
    xgAgainst: statOrNull(row.away_xg, row.home_xg),
  };
}

const pct = (arr, f) => (arr.length ? arr.filter(f).length / arr.length : null);

/** Métricas descriptivas de una ventana de partidos (ya en perspectiva del equipo). */
function summarize(games) {
  const n = games.length;
  const w = games.filter((g) => g.result === 'W').length;
  const d = games.filter((g) => g.result === 'D').length;
  const l = n - w - d;
  const withCorners = games.filter((g) => g.cornersFor !== null);
  const withCards = games.filter((g) => g.cardsFor !== null);
  return {
    n, wins: w, draws: d, losses: l,
    ppg: n ? (3 * w + d) / n : null,
    goalsFor: mean(games.map((g) => g.gf)),
    goalsAgainst: mean(games.map((g) => g.ga)),
    btts: pct(games, (g) => g.gf > 0 && g.ga > 0),
    over15: pct(games, (g) => g.gf + g.ga > 1.5),
    over25: pct(games, (g) => g.gf + g.ga > 2.5),
    over35: pct(games, (g) => g.gf + g.ga > 3.5),
    cleanSheets: pct(games, (g) => g.ga === 0),
    failedToScore: pct(games, (g) => g.gf === 0),
    statsN: withCorners.length,
    cornersFor: mean(withCorners.map((g) => g.cornersFor)),
    cornersAgainst: mean(withCorners.map((g) => g.cornersAgainst)),
    cardsN: withCards.length,
    cardsFor: mean(withCards.map((g) => g.cardsFor)),
    cardsAgainst: mean(withCards.map((g) => g.cardsAgainst)),
  };
}

/**
 * @param {string} teamId
 * @param {object[]} rows filas de repos.teamHistory (recientes primero)
 * @param {'home'|'away'} venue sede del próximo partido
 * @param {object} baseline { home, away } medias de goles del pool
 * @param {number} refTime unix del partido a pronosticar (para decaimiento temporal)
 */
function buildTeamProfile(teamId, rows, venue, baseline, refTime, params = config.model, ratings = null) {
  const games = rows.map((r) => perspective(r, teamId));
  const venueGames = games.filter((g) => g.isHome === (venue === 'home'));

  // Fuerzas ataque/defensa normalizadas (Maher): ajuste por sede + decaimiento temporal + encogimiento
  const mu = (baseline.home + baseline.away) / 2;
  const h = Math.sqrt(baseline.home / baseline.away);
  const initial = (params.eloInitial ?? 1500);
  const oppFactor = (g) => {
    if (!ratings) return 1;
    const r = ratings.get(g.opponentId);
    return r ? Math.max(0.5, Math.min(1.5, r.elo / initial)) : 1;
  };
  const weights = games.map((g) => 0.5 ** (Math.max(0, refTime - g.startTime) / 86400 / params.decayHalfLifeDays) * oppFactor(g));
  const adjScored = games.map((g) => (g.isHome ? g.gf / h : g.gf * h));
  const adjConceded = games.map((g) => (g.isHome ? g.ga * h : g.ga / h));
  const attack = shrink(adjScored, weights, mu, params.shrinkageGames) / mu;
  const defense = shrink(adjConceded, weights, mu, params.shrinkageGames) / mu;

  const statGames = games.filter((g) => g.cornersFor !== null);
  const cardGames = games.filter((g) => g.cardsFor !== null);
  const xgGames = games.filter((g) => g.xgFor !== null);

  return {
    teamId,
    n: games.length,
    all: summarize(games),
    last5: summarize(games.slice(0, 5)),
    last10: summarize(games.slice(0, 10)),
    last20: summarize(games.slice(0, 20)),
    last50: summarize(games.slice(0, 50)),
    venue: summarize(venueGames),
    form: games.slice(0, 5).map((g) => g.result).join(''),
    strength: { attack, defense, mu, homeFactor: h },
    corners: {
      n: statGames.length,
      for: mean(statGames.map((g) => g.cornersFor)),
      against: mean(statGames.map((g) => g.cornersAgainst)),
      totals: statGames.map((g) => g.cornersFor + g.cornersAgainst),
    },
    cards: {
      n: cardGames.length,
      for: mean(cardGames.map((g) => g.cardsFor)),
      against: mean(cardGames.map((g) => g.cardsAgainst)),
      totals: cardGames.map((g) => g.cardsFor + g.cardsAgainst),
    },
    xg: { n: xgGames.length, for: mean(xgGames.map((g) => g.xgFor)), against: mean(xgGames.map((g) => g.xgAgainst)) },
    latestMatchTime: games[0]?.startTime ?? null,
    matches: games.slice(0, 10).map((g) => ({ matchId: g.matchId, startTime: g.startTime, isHome: g.isHome, gf: g.gf, ga: g.ga, result: g.result })),
  };
}

module.exports = { buildTeamProfile, summarize, perspective, variance };
