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
    shotsFor: statOrNull(row.home_shots, row.away_shots),
    shotsAgainst: statOrNull(row.away_shots, row.home_shots),
    sotFor: statOrNull(row.home_sot, row.away_sot),
    sotAgainst: statOrNull(row.away_sot, row.home_sot),
    foulsFor: statOrNull(row.home_fouls, row.away_fouls),
    redFor: hasStats && row.home_red !== null && row.away_red !== null ? pick(row.home_red, row.away_red) : null,
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
    ...attackDefense(games),
  };
}

/** Variables de ataque, defensa y disciplina (solo partidos con el dato; cada una con su n). */
function attackDefense(games) {
  const avg = (f) => { const v = games.map(f).filter((x) => x !== null && x !== undefined); return { v: mean(v), n: v.length }; };
  const shots = avg((g) => g.shotsFor);
  const withShots = games.filter((g) => g.shotsFor !== null && g.shotsFor > 0);
  const goalsOnShots = withShots.reduce((a, g) => a + g.gf, 0);
  const totalShots = withShots.reduce((a, g) => a + g.shotsFor, 0);
  return {
    shotsFor: shots.v, shotsN: shots.n, shotsAgainst: avg((g) => g.shotsAgainst).v,
    sotFor: avg((g) => g.sotFor).v, sotAgainst: avg((g) => g.sotAgainst).v,
    conversion: totalShots > 0 ? goalsOnShots / totalShots : null,
    xgFor: avg((g) => g.xgFor).v, xgAgainst: avg((g) => g.xgAgainst).v, xgN: avg((g) => g.xgFor).n,
    foulsFor: avg((g) => g.foulsFor).v, redsFor: avg((g) => g.redFor).v,
  };
}

/**
 * Actualización bayesiana Gamma-Poisson (modelo 9). Prior Gamma(α0 = k·μ, β0 = k) sobre la tasa
 * de goles; cada partido aporta (w·goles, w). Posterior: α = α0 + Σw·g, β = β0 + Σw.
 * Media = α/β (la fuerza usada por Poisson/Dixon-Coles) y desviación típica = √α/β.
 */
function gammaPosterior(values, weights, prior, k) {
  let a = k * prior;
  let b = k;
  for (let i = 0; i < values.length; i++) { a += weights[i] * values[i]; b += weights[i]; }
  return { mean: a / b, sd: Math.sqrt(a) / b, alpha: a, beta: b };
}

/**
 * @param {string} teamId
 * @param {object[]} rows filas de repos.teamHistory (recientes primero)
 * @param {'home'|'away'} venue sede del próximo partido
 * @param {object} baseline { home, away } medias de goles del pool
 * @param {number} refTime unix del partido a pronosticar (para decaimiento temporal)
 */
function buildTeamProfile(teamId, rows, venue, baseline, refTime, params = config.model, xgBase = null) {
  const games = rows.map((r) => perspective(r, teamId));
  const venueGames = games.filter((g) => g.isHome === (venue === 'home'));

  // Fuerzas ataque/defensa normalizadas (Maher): ajuste por sede + decaimiento temporal + encogimiento
  const mu = (baseline.home + baseline.away) / 2;
  const h = Math.sqrt(baseline.home / baseline.away);
  const weights = games.map((g) => 0.5 ** (Math.max(0, refTime - g.startTime) / 86400 / params.decayHalfLifeDays));
  const adjScored = games.map((g) => (g.isHome ? g.gf / h : g.gf * h));
  const adjConceded = games.map((g) => (g.isHome ? g.ga * h : g.ga / h));
  const atkPost = gammaPosterior(adjScored, weights, mu, params.shrinkageGames);
  const defPost = gammaPosterior(adjConceded, weights, mu, params.shrinkageGames);
  const attack = atkPost.mean / mu;
  const defense = defPost.mean / mu;

  // Modelos 7 y 8 – xG / xGA: misma normalización con goles esperados en lugar de goles
  let xgStrength = null;
  const xgGamesAll = games.map((g, i) => ({ g, w: weights[i] })).filter((x) => x.g.xgFor !== null && x.g.xgAgainst !== null);
  if (xgBase && xgBase.n >= 20 && xgBase.home > 0 && xgBase.away > 0 && xgGamesAll.length >= (params.minXgSample ?? 5)) {
    const muX = (xgBase.home + xgBase.away) / 2;
    const hx = Math.sqrt(xgBase.home / xgBase.away);
    const ws = xgGamesAll.map((x) => x.w);
    const a = gammaPosterior(xgGamesAll.map((x) => (x.g.isHome ? x.g.xgFor / hx : x.g.xgFor * hx)), ws, muX, params.shrinkageGames);
    const d = gammaPosterior(xgGamesAll.map((x) => (x.g.isHome ? x.g.xgAgainst * hx : x.g.xgAgainst / hx)), ws, muX, params.shrinkageGames);
    xgStrength = { attack: a.mean / muX, defense: d.mean / muX, mu: muX, homeFactor: hx, n: xgGamesAll.length };
  }

  // Físico: descanso y congestión (con los partidos registrados de cualquier competición)
  const before = games.filter((g) => g.startTime < refTime);
  const restDays = before.length ? (refTime - before[0].startTime) / 86400 : null;
  const fatigue = {
    restDays: restDays === null ? null : Math.round(restDays * 10) / 10,
    matches7: before.filter((g) => refTime - g.startTime <= 7 * 86400).length,
    matches14: before.filter((g) => refTime - g.startTime <= 14 * 86400).length,
  };

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
    strength: { attack, defense, mu, homeFactor: h, attackSd: atkPost.sd / mu, defenseSd: defPost.sd / mu },
    xgStrength,
    fatigue,
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
