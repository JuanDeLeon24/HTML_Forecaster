'use strict';
/**
 * Forecast Engine: combina analizadores y modelos para producir el pronóstico
 * completo de un partido, con trazabilidad de entradas, parámetros y salida.
 *
 * Flujo por partido:
 *  1. Histórico real de ambos equipos ANTES del inicio (sin fuga de información).
 *  2. Perfiles (forma, ventanas 5/10/20/50, sede, fuerzas, corners, tarjetas).
 *  3. H2H.
 *  4. λ → matriz Poisson + Dixon-Coles.
 *  5. 1X2 de Elo y del modelo ponderado → ensamble.
 *  6. La matriz se reescala para que su 1X2 coincida con el ensamble: todos los
 *     mercados de goles quedan coherentes entre sí y con el 1X2 final.
 *  7. Corners / tarjetas (Poisson o Binomial Negativa).
 *  8. Valor esperado vs. cuotas reales, calidad del dato, explicación, pick.
 */
const config = require('../config');
const { createLogger } = require('../lib/logger');
const { round } = require('../lib/math');
const { buildTeamProfile } = require('../analyzers/teamForm');
const { summarizeH2H } = require('../analyzers/h2h');
const { expectedGoals } = require('../analyzers/goals');
const { cornersForecast, CORNER_LINES } = require('../analyzers/corners');
const { cardsForecast, CARD_LINES } = require('../analyzers/cards');
const { blend1X2 } = require('../analyzers/results');
const { impliedNoVig, valueOf } = require('../analyzers/valuebets');
const { scoreMatrix, marketsFromMatrix } = require('../models/poisson');
const { bivariateMatrix } = require('../models/bivariate');
const { treeProbabilities } = require('../models/tree');
const { computeRatings, eloProbabilities } = require('../models/elo');
const { weightedProbabilities } = require('../models/weighted');
const { assessQuality, confidenceIndex } = require('./quality');
const { explain } = require('./explain');
const { label, legKey } = require('./markets');
const { suggestCombinations, CANDIDATE_LEGS, marginal } = require('./combinations');
const { getModelParams } = require('../learning/params');

const log = createLogger('forecast');

const PRIOR_BASELINE = { n: 0, home: 1.5, away: 1.2, draw_rate: null, scope: 'prior' };

function resolveBaseline(repos, tournamentId, refTime) {
  const b = repos.goalBaseline(tournamentId, refTime);
  if (!b || !b.n || b.n < 20 || !b.home || !b.away) return { ...PRIOR_BASELINE };
  return b;
}

/** Reescala la matriz para que P(1), P(X), P(2) coincidan con el ensamble. */
function rescaleMatrix(matrix, target) {
  const region = (h, a) => (h > a ? '1' : h === a ? 'X' : '2');
  const tot = { 1: 0, X: 0, 2: 0 };
  for (let h = 0; h < matrix.length; h++) for (let a = 0; a < matrix[h].length; a++) tot[region(h, a)] += matrix[h][a];
  return matrix.map((row, h) => row.map((p, a) => {
    const r = region(h, a);
    return tot[r] > 0 ? (p * target[r]) / tot[r] : 0;
  }));
}

/**
 * @param match fila de repos.getMatch
 * @param ctx { repos, ratings (Map de Elo), params }
 */
function forecastMatch(match, { repos, ratings, params }) {
  const ref = match.start_time;
  const names = { home: match.home_name, away: match.away_name };
  const baseline = resolveBaseline(repos, match.tournament_id, ref);
  const drawRate = baseline.n >= 100 && baseline.draw_rate ? baseline.draw_rate : params.baseDrawRate;

  const home = buildTeamProfile(match.home_team_id, repos.teamHistory(match.home_team_id, ref, 50), 'home', baseline, ref, params, ratings);
  const away = buildTeamProfile(match.away_team_id, repos.teamHistory(match.away_team_id, ref, 50), 'away', baseline, ref, params, ratings);
  const h2h = summarizeH2H(repos.h2hHistory(match.home_team_id, match.away_team_id, ref, 20), match.home_team_id, match.away_team_id);
  const oddsRows = repos.oddsFor(match.id);
  const quality = assessQuality({ home, away, h2h, baseline, refTime: ref, oddsCount: oddsRows.length }, params);

  const matchInfo = {
    id: match.id, home: names.home, away: names.away, homeId: match.home_team_id, awayId: match.away_team_id,
    tournament: match.tournament_name, tournamentId: match.tournament_id, startTime: ref, status: match.status,
  };

  const inputs = {
    baseline, drawRate,
    profiles: { home: slimProfile(home), away: slimProfile(away) },
    h2h,
  };

  if (quality.insufficient) {
    return {
      status: 'insufficient', matchInfo, inputs, quality, predictions: [],
      output: { match: matchInfo, status: 'insufficient', reason: `Muestra insuficiente: local ${home.n}, visitante ${away.n} partidos (mínimo ${params.minTeamSample}). No se emite pronóstico.` },
    };
  }

  // --- Goles: Poisson + Dixon-Coles
  const lambdas = expectedGoals(home, away, h2h, params);
  const rawMatrix = scoreMatrix(lambdas.home, lambdas.away, { rho: params.dixonColesRho, maxGoals: params.maxGoals });
  const poisson = marketsFromMatrix(rawMatrix);
  const bivMatrix = bivariateMatrix(lambdas.home, lambdas.away, 0.25, params.maxGoals);
  const bivariate = marketsFromMatrix(bivMatrix);

  // --- Elo
  const eh = ratings.get(match.home_team_id);
  const ea = ratings.get(match.away_team_id);
  const eloReady = eh && ea && eh.games >= 5 && ea.games >= 5;
  const elo = eloReady ? eloProbabilities(eh.elo, ea.elo, { drawRate }) : null;

  // --- Ponderado
  const weighted = weightedProbabilities({ home, away, h2h }, { weights: params.weightedFactors, slope: params.weightedSlope, drawRate });
  const tree = treeProbabilities(weighted);

  const weights = { ...params.ensemble };
  if (!elo) weights.elo = 0;
  const final1X2 = blend1X2({ poisson: poisson['1X2'], elo, weighted, bivariate: bivariate['1X2'], tree }, weights);
  const matrix = rescaleMatrix(rawMatrix, final1X2);
  const goals = marketsFromMatrix(matrix);

  const corners = cornersForecast(home, away, h2h);
  const cards = cardsForecast(home, away, h2h);

  const probabilities = {
    '1X2': goals['1X2'],
    DC: goals.DC,
    OU: { over: goals.over },
    BTTS: { yes: goals.btts, no: 1 - goals.btts },
    TEAM_OU: goals.teamOver,
    CORNERS: corners.available ? { over: corners.over, expected: corners.expected } : null,
    CARDS: cards.available ? { over: cards.over, expected: cards.expected } : null,
  };

  const output = {
    match: matchInfo,
    status: 'ok',
    probabilities: roundDeep(probabilities),
    models: {
      poisson: roundDeep(poisson['1X2']), elo: elo ? roundDeep(elo) : null,
      weighted: roundDeep({ 1: weighted[1], X: weighted.X, 2: weighted[2], score: weighted.score, components: weighted.components }),
      bivariate: roundDeep(bivariate['1X2']),
      tree: roundDeep(tree),
      ensembleWeights: weights,
    },
    lambdas: roundDeep(lambdas),
    expectedGoals: roundDeep(goals.expectedGoals),
    topScores: goals.topScores.map((s) => ({ ...s, p: round(s.p, 4) })),
    scoreMatrix: matrix.map((r) => r.map((p) => round(p, 6))),
    elo: eloReady ? { home: roundDeep(eh), away: roundDeep(ea) } : null,
    corners: roundDeep(corners),
    cards: roundDeep(cards),
  };

  // --- Valor frente al mercado
  const market = impliedNoVig(oddsRows);
  const value = [];
  for (const [k, o] of market) {
    const [m, sel, line] = k.split('|');
    const leg = { market: m, selection: sel, line: Number(line) };
    const p = marginal(output, leg);
    if (p === undefined || p === null) continue;
    const v = valueOf(p, o.odds);
    value.push({ ...leg, label: label(leg, names), probability: round(p), odds: o.odds, impliedNoVig: round(o.impliedNoVig), ev: round(v.ev), kellyQuarter: round(v.kellyQuarter) });
  }
  value.sort((a, b) => b.ev - a.ev);
  output.value = value;

  // --- Pick principal (mayor índice de confianza entre mercados candidatos)
  const candidates = CANDIDATE_LEGS.concat([{ market: '1X2', selection: 'X' }, { market: 'DC', selection: '12' }])
    .map((l) => ({ ...l, line: l.line ?? 0 }))
    .map((l) => ({ ...l, probability: marginal(output, l) }))
    .filter((l) => l.probability !== undefined && l.probability !== null)
    .map((l) => ({ ...l, label: label(l, names), confidence: round(confidenceIndex(l.probability, quality.score)) }))
    .sort((a, b) => b.confidence - a.confidence);
  output.pick = candidates[0] ?? null;
  output.alternatives = candidates.slice(1, 6);
  output.combinations = suggestCombinations(output);
  output.explanation = explain({ names, home, away, h2h, lambdas, elo: output.elo, probs: probabilities, corners, cards });
  output.quality = quality;

  // --- Filas binarias para validación (todas las selecciones de todos los mercados)
  const predictions = flattenPredictions(probabilities, { poisson: poisson['1X2'], elo, weighted, bivariate: bivariate['1X2'], tree }, oddsRows, output.pick);
  inputs.lambdasBase = lambdas.base;
  return { status: 'ok', matchInfo, inputs, quality, output, predictions };
}

function flattenPredictions(probs, models, oddsRows, pick) {
  const oddsMap = new Map(oddsRows.map((o) => [`${o.market}|${o.selection}|${o.line}`, o.decimal_odds]));
  const rows = [];
  const push = (market, selection, line, p, components) => {
    const leg = { market, selection, line };
    rows.push({ market, selection, line, probability: round(p, 6), components, odds: oddsMap.get(legKey(leg)) ?? null, isPick: pick && legKey(pick) === legKey(leg) });
  };
  for (const s of ['1', 'X', '2']) {
    push('1X2', s, 0, probs['1X2'][s], { poisson: round(models.poisson[s], 6), elo: models.elo ? round(models.elo[s], 6) : null, weighted: round(models.weighted[s], 6), bivariate: models.bivariate ? round(models.bivariate[s], 6) : null, tree: models.tree ? round(models.tree[s], 6) : null });
  }
  for (const s of ['1X', 'X2', '12']) push('DC', s, 0, probs.DC[s]);
  for (const [line, p] of Object.entries(probs.OU.over)) {
    push('OU', 'over', Number(line), p);
    if (Number(line) > 0.5) push('OU', 'under', Number(line), 1 - p);
  }
  push('BTTS', 'yes', 0, probs.BTTS.yes);
  push('BTTS', 'no', 0, probs.BTTS.no);
  for (const side of ['home', 'away']) for (const [line, p] of Object.entries(probs.TEAM_OU[side])) push('TEAM_OU', side, Number(line), p);
  for (const [mk, lines] of [['CORNERS', CORNER_LINES], ['CARDS', CARD_LINES]]) {
    if (!probs[mk]) continue;
    for (const line of lines) {
      push(mk, 'over', line, probs[mk].over[line]);
      push(mk, 'under', line, 1 - probs[mk].over[line]);
    }
  }
  return rows;
}

function slimProfile(p) {
  const { corners, cards, ...rest } = p;
  return { ...roundDeep(rest), corners: roundDeep({ n: corners.n, for: corners.for, against: corners.against }), cards: roundDeep({ n: cards.n, for: cards.for, against: cards.against }) };
}

function roundDeep(o) {
  if (typeof o === 'number') return round(o, 4);
  if (Array.isArray(o)) return o.map(roundDeep);
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, roundDeep(v)]));
  return o;
}

/**
 * Pronostica todos los partidos aún no iniciados de una franja horaria.
 * Los partidos ya comenzados conservan su último pronóstico pre-partido.
 */
function runForecasts(fromSec, toSec, { repos, now = Math.floor(Date.now() / 1000), includeStarted = false } = {}) {
  const params = getModelParams(repos);
  const ratings = computeRatings(repos.allFinishedMatches(fromSec));
  const matches = repos.matchesBetween(fromSec, toSec);
  const summary = { total: matches.length, forecasted: 0, insufficient: 0, skippedStarted: 0, errors: 0 };
  for (const m of matches) {
    if (!includeStarted && (m.status !== 'notstarted' || m.start_time <= now)) { summary.skippedStarted += 1; continue; }
    try {
      const r = forecastMatch(m, { repos, ratings, params });
      repos.saveForecast({
        matchId: m.id, modelVersion: config.model.version,
        params: { ensemble: r.output.models?.ensembleWeights ?? params.ensemble, rho: params.dixonColesRho, weightedFactors: params.weightedFactors, learned: params.learned },
        inputs: r.inputs, output: r.output, quality: r.quality,
      }, r.predictions);
      if (r.status === 'ok') summary.forecasted += 1; else summary.insufficient += 1;
    } catch (err) {
      summary.errors += 1;
      log.error(`Error pronosticando ${m.id}`, err);
    }
  }
  log.info('Pronósticos generados', summary);
  return summary;
}

module.exports = { forecastMatch, runForecasts, rescaleMatrix, flattenPredictions };
