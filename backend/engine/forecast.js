'use strict';
/**
 * Forecast Engine: combina analizadores y modelos para producir el pronóstico completo de un
 * partido, con trazabilidad de entradas, parámetros y salida.
 *
 * Modelos individuales (todos con datos anteriores al inicio del partido):
 *   1 Poisson clásico · 2 Poisson bivariado · 3 Dixon-Coles · 4–6 Elo general/ofensivo/defensivo
 *   (+ local/visitante) · 7–8 xG/xGA · 9 actualización bayesiana Gamma-Poisson (fuerzas)
 *   · 11 regresión logística (si está entrenada y validada) · ponderado (nivel 1)
 * 16 Ensamble: mezcla del 1X2 con pesos aprendidos; la matriz Dixon-Coles se reescala para que
 *   todos los mercados de goles sean coherentes con el 1X2 final.
 * Después: calibración por mercado, score de confianza, explicabilidad por ablación, valor.
 */
const config = require('../config');
const { createLogger, recordError, logPrediction } = require('../lib/logger');
const { round, clamp } = require('../lib/math');
const { buildTeamProfile } = require('../analyzers/teamForm');
const { summarizeH2H } = require('../analyzers/h2h');
const { expectedGoals } = require('../analyzers/goals');
const { cornersForecast, CORNER_LINES } = require('../analyzers/corners');
const { cardsForecast, CARD_LINES } = require('../analyzers/cards');
const { blend1X2 } = require('../analyzers/results');
const { impliedNoVig } = require('../analyzers/valuebets');
const { scoreMatrix, marketsFromMatrix } = require('../models/poisson');
const { bivariateMatrix } = require('../models/bivariatePoisson');
const { computeRatings, eloProbabilities } = require('../models/elo');
const { weightedProbabilities } = require('../models/weighted');
const logistic = require('../models/logistic');
const calibration = require('../calibration');
const { assessQuality } = require('./quality');
const { confidenceScore, rankIndex } = require('./confidence');
const { evaluateValue } = require('./valueBets');
const { explain } = require('./explain');
const { label, legKey } = require('./markets');
const { suggestCombinations, CANDIDATE_LEGS, marginal } = require('./combinations');
const { getModelParams } = require('../learning/params');
const { validateForecastOutput } = require('../validators');
const { binaryMetrics } = require('../validation/metrics');

const log = createLogger('forecast');

const PRIOR_BASELINE = { n: 0, home: 1.5, away: 1.2, draw_rate: null, scope: 'prior' };

function resolveBaseline(repos, tournamentId, refTime) {
  const b = repos.goalBaseline(tournamentId, refTime);
  if (!b || !b.n || b.n < 20 || !b.home || !b.away) return { ...PRIOR_BASELINE };
  return b;
}

/** Reescala la matriz para que P(1), P(X), P(2) coincidan con el objetivo. */
function rescaleMatrix(matrix, target) {
  const region = (h, a) => (h > a ? '1' : h === a ? 'X' : '2');
  const tot = { 1: 0, X: 0, 2: 0 };
  for (let h = 0; h < matrix.length; h++) for (let a = 0; a < matrix[h].length; a++) tot[region(h, a)] += matrix[h][a];
  return matrix.map((row, h) => row.map((p, a) => {
    const r = region(h, a);
    return tot[r] > 0 ? (p * target[r]) / tot[r] : 0;
  }));
}

const withStrength = (p, patch) => ({ ...p, strength: { ...p.strength, ...patch } });

/**
 * Núcleo de cálculo (puro). `ov` neutraliza factores para la explicabilidad por ablación:
 * { noHome, noElo, neutralForm, neutralAttack, neutralDefense, noXg, noH2H, noRest }
 */
function computeCore(ctx, ov = {}) {
  const { params, drawRate, eh, ea } = ctx;
  let { home, away, h2h } = ctx;
  if (ov.noH2H) h2h = { ...h2h, n: 0, avgGoals: null };
  if (ov.noHome) { home = withStrength(home, { homeFactor: 1 }); away = withStrength(away, { homeFactor: 1 }); }
  if (ov.neutralAttack) { home = withStrength(home, { attack: 1 }); away = withStrength(away, { attack: 1 }); }
  if (ov.neutralDefense) { home = withStrength(home, { defense: 1 }); away = withStrength(away, { defense: 1 }); }

  const lambdas = expectedGoals(home, away, h2h, params);
  const dcMatrix = scoreMatrix(lambdas.home, lambdas.away, { rho: params.dixonColesRho, maxGoals: params.maxGoals });
  const dc = marketsFromMatrix(dcMatrix);
  const classic = marketsFromMatrix(scoreMatrix(lambdas.home, lambdas.away, { rho: 0, maxGoals: params.maxGoals }));
  const biv = bivariateMatrix(lambdas.home, lambdas.away, { lambda3: params.bivariateLambda3, maxGoals: params.maxGoals });
  const bivariate = marketsFromMatrix(biv.matrix);

  let elo = null;
  if (eh && ea && eh.games >= 5 && ea.games >= 5) {
    elo = ov.noElo
      ? eloProbabilities(1500, 1500, { drawRate, homeAdv: ov.noHome ? 0 : params.eloHomeAdvantage })
      : eloProbabilities(eh.elo, ea.elo, { drawRate, homeAdv: ov.noHome ? 0 : params.eloHomeAdvantage });
  }

  const zero = [];
  if (ov.noHome) zero.push('home');
  if (ov.neutralForm) zero.push('form');
  if (ov.neutralAttack) zero.push('attack');
  if (ov.neutralDefense) zero.push('defense');
  if (ov.noH2H) zero.push('h2h');
  const weighted = weightedProbabilities({ home: ctx.home, away: ctx.away, h2h: ctx.h2h }, { weights: params.weightedFactors, slope: params.weightedSlope, drawRate, zero });

  // Modelos 7–8: xG/xGA con la misma estructura multiplicativa
  let xg = null;
  let xgLambdas = null;
  const hx = home.xgStrength;
  const ax = away.xgStrength;
  if (!ov.noXg && hx && ax) {
    const hf = ov.noHome ? 1 : hx.homeFactor;
    const atk = (s) => (ov.neutralAttack ? 1 : s.attack);
    const def = (s) => (ov.neutralDefense ? 1 : s.defense);
    xgLambdas = { home: clamp(hx.mu * atk(hx) * def(ax) * hf, 0.1, 5), away: clamp(hx.mu * atk(ax) * def(hx) / hf, 0.1, 5) };
    xg = marketsFromMatrix(scoreMatrix(xgLambdas.home, xgLambdas.away, { rho: params.dixonColesRho, maxGoals: params.maxGoals }));
  }

  const features = {
    lambdaDiff: lambdas.home - lambdas.away,
    lambdaTotal: lambdas.home + lambdas.away,
    formDiff: ov.neutralForm ? 0 : (ctx.home.last5.ppg ?? 0) - (ctx.away.last5.ppg ?? 0),
    restDiff: ov.noRest ? 0 : clamp((ctx.home.fatigue.restDays ?? 7) - (ctx.away.fatigue.restDays ?? 7), -14, 14),
    positionDiff: ctx.positionDiff ?? 0,
  };
  const models = { poisson: dc['1X2'], classic: classic['1X2'], bivariate: bivariate['1X2'], elo, weighted: { 1: weighted[1], X: weighted.X, 2: weighted[2], score: weighted.score, components: weighted.components }, xg: xg ? xg['1X2'] : null };
  let logit = null;
  if (params.logisticModel) {
    const x = logistic.featuresOf({ models, features });
    if (x) logit = logistic.predict(params.logisticModel, x);
  }
  models.logistic = logit;

  const weights = { ...params.ensemble };
  for (const m of Object.keys(weights)) if (!models[m]) weights[m] = 0;
  const final1X2 = blend1X2({ poisson: dc['1X2'], elo, weighted, xg: models.xg, logistic: logit }, weights);
  return { lambdas, xgLambdas, dcMatrix, dc, classic, bivariate, biv, xg, elo, weighted, models, weights, final1X2, features };
}

/** Aplica la calibración aprendida a un mercado; devuelve {p, raw, calibrated}. */
function calibrate(params, market, p) {
  const model = params.calibration?.[market];
  if (!model) return p;
  return calibration.apply(model, p);
}

/**
 * @param match fila de repos.getMatch
 * @param ctx { repos, ratings (Map de Elo), params, health (salud por mercado) }
 */
function forecastMatch(match, { repos, ratings, params, health = {} }) {
  const ref = match.start_time;
  const names = { home: match.home_name, away: match.away_name };
  const baseline = resolveBaseline(repos, match.tournament_id, ref);
  const xgBase = repos.xgBaseline ? repos.xgBaseline(match.tournament_id, ref) : null;
  const drawRate = baseline.n >= 100 && baseline.draw_rate ? baseline.draw_rate : params.baseDrawRate;

  const home = buildTeamProfile(match.home_team_id, repos.teamHistory(match.home_team_id, ref, 50), 'home', baseline, ref, params, xgBase);
  const away = buildTeamProfile(match.away_team_id, repos.teamHistory(match.away_team_id, ref, 50), 'away', baseline, ref, params, xgBase);
  const h2h = summarizeH2H(repos.h2hHistory(match.home_team_id, match.away_team_id, ref, 20), match.home_team_id, match.away_team_id);
  const oddsRows = repos.oddsFor(match.id);
  const quality = assessQuality({ home, away, h2h, baseline, refTime: ref, oddsCount: oddsRows.length }, params);
  const sh = match.season_id ? repos.standingFor(match.tournament_id, match.season_id, match.home_team_id) : null;
  const sa = match.season_id ? repos.standingFor(match.tournament_id, match.season_id, match.away_team_id) : null;
  const context = { home: sh ? { position: sh.position, points: sh.points, played: sh.played } : null, away: sa ? { position: sa.position, points: sa.points, played: sa.played } : null };

  const matchInfo = {
    id: match.id, home: names.home, away: names.away, homeId: match.home_team_id, awayId: match.away_team_id,
    tournament: match.tournament_name, tournamentId: match.tournament_id, startTime: ref, status: match.status,
  };

  const inputs = { baseline, xgBaseline: xgBase, drawRate, profiles: { home: slimProfile(home), away: slimProfile(away) }, h2h, context };

  if (quality.insufficient) {
    return {
      status: 'insufficient', matchInfo, inputs, quality, predictions: [],
      output: { match: matchInfo, status: 'insufficient', reason: `Muestra insuficiente: local ${home.n}, visitante ${away.n} partidos (mínimo ${params.minTeamSample}). No se emite pronóstico.` },
    };
  }

  const eh = ratings.get(match.home_team_id);
  const ea = ratings.get(match.away_team_id);
  const ctx = { params, drawRate, eh, ea, home, away, h2h, positionDiff: sh && sa ? sa.position - sh.position : 0 };
  const core = computeCore(ctx);

  // Matriz final coherente con el ensamble
  const matrix = rescaleMatrix(core.dcMatrix, core.final1X2);
  const goals = marketsFromMatrix(matrix);
  const corners = cornersForecast(home, away, h2h);
  const cards = cardsForecast(home, away, h2h);

  // --- Probabilidades sin calibrar
  const raw = {
    '1X2': goals['1X2'], OU: { over: goals.over }, BTTS: { yes: goals.btts }, TEAM_OU: goals.teamOver,
    CORNERS: corners.available ? corners.over : null, CARDS: cards.available ? cards.over : null,
  };
  // --- Calibración por mercado (solo si fue validada fuera de muestra)
  const c1 = { 1: calibrate(params, '1X2', raw['1X2'][1]), X: calibrate(params, '1X2', raw['1X2'].X), 2: calibrate(params, '1X2', raw['1X2'][2]) };
  const s1 = c1[1] + c1.X + c1[2];
  const p1X2 = { 1: c1[1] / s1, X: c1.X / s1, 2: c1[2] / s1 };
  const over = Object.fromEntries(Object.entries(raw.OU.over).map(([l, p]) => [l, calibrate(params, 'OU', p)]));
  const bttsYes = calibrate(params, 'BTTS', raw.BTTS.yes);
  const cOver = raw.CORNERS ? Object.fromEntries(Object.entries(raw.CORNERS).map(([l, p]) => [l, calibrate(params, 'CORNERS', p)])) : null;
  const kOver = raw.CARDS ? Object.fromEntries(Object.entries(raw.CARDS).map(([l, p]) => [l, calibrate(params, 'CARDS', p)])) : null;

  const probabilities = {
    '1X2': p1X2,
    DC: { '1X': p1X2[1] + p1X2.X, X2: p1X2.X + p1X2[2], 12: p1X2[1] + p1X2[2] },
    OU: { over },
    BTTS: { yes: bttsYes, no: 1 - bttsYes },
    TEAM_OU: goals.teamOver,
    CORNERS: cOver ? { over: cOver, expected: corners.expected } : null,
    CARDS: kOver ? { over: kOver, expected: cards.expected } : null,
  };
  const calibratedMarkets = Object.keys(params.calibration || {});

  // --- Comparador de modelos
  const modelRows = [
    ['poisson_classic', 'Poisson clásico', core.classic['1X2'], core.lambdas],
    ['poisson_bivariate', 'Poisson bivariado', core.bivariate['1X2'], core.lambdas],
    ['dixon_coles', 'Dixon-Coles', core.dc['1X2'], core.lambdas],
    ['elo', 'Elo', core.elo, null],
    ['weighted', 'Ponderado', core.models.weighted, null],
    ['xg', 'xG/xGA', core.models.xg, core.xgLambdas],
    ['logistic', 'Regresión logística', core.models.logistic, null],
    ['ensemble', 'Ensamble (final)', probabilities['1X2'], core.lambdas],
  ].filter((r) => r[2]);

  // --- Salud histórica de cada mercado (para confianza y descartes de valor)
  const marketsOf = (m) => [m.poisson, m.classic, m.bivariate, m.xg].filter(Boolean);
  const goalModelMarkets = [core.dc, core.classic, core.bivariate, core.xg].filter(Boolean);
  const modelProbsFor = (leg) => {
    if (leg.market === '1X2') return [core.models.poisson, core.models.elo, core.models.weighted, core.models.xg, core.models.logistic].filter(Boolean).map((p) => p[leg.selection]);
    if (leg.market === 'DC') return [core.models.poisson, core.models.elo, core.models.weighted, core.models.xg, core.models.logistic].filter(Boolean).map((p) => (leg.selection === '1X' ? p[1] + p.X : leg.selection === 'X2' ? p.X + p[2] : p[1] + p[2]));
    if (leg.market === 'OU') return goalModelMarkets.map((g) => (leg.selection === 'over' ? g.over[leg.line] : 1 - g.over[leg.line]));
    if (leg.market === 'BTTS') return goalModelMarkets.map((g) => (leg.selection === 'yes' ? g.btts : 1 - g.btts));
    return [];
  };
  void marketsOf;

  const output = {
    match: matchInfo,
    status: 'ok',
    probabilities: roundDeep(probabilities),
    rawProbabilities: roundDeep(raw),
    calibratedMarkets,
    models: {
      poisson: roundDeep(core.dc['1X2']), classic: roundDeep(core.classic['1X2']), bivariate: roundDeep(core.bivariate['1X2']),
      elo: core.elo ? roundDeep(core.elo) : null, weighted: roundDeep(core.models.weighted), xg: core.models.xg ? roundDeep(core.models.xg) : null,
      logistic: core.models.logistic ? roundDeep(core.models.logistic) : null, ensembleWeights: core.weights,
    },
    modelComparison: modelRows.map(([key, name, p, l]) => ({ key, name, 1: round(p[1]), X: round(p.X), 2: round(p[2]), lambdaHome: l ? round(l.home, 3) : null, lambdaAway: l ? round(l.away, 3) : null })),
    features: roundDeep(core.features),
    lambdas: roundDeep(core.lambdas),
    xgLambdas: core.xgLambdas ? roundDeep(core.xgLambdas) : null,
    bivariateLambda3: round(core.biv.lambda3, 3),
    expectedGoals: roundDeep(goals.expectedGoals),
    topScores: goals.topScores.map((s) => ({ ...s, p: round(s.p, 4) })),
    scoreMatrix: matrix.map((r) => r.map((p) => round(p, 6))),
    elo: eh && ea && core.elo ? { home: roundDeep(eh), away: roundDeep(ea) } : null,
    corners: roundDeep(corners),
    cards: roundDeep(cards),
    context,
    fatigue: { home: home.fatigue, away: away.fatigue },
    bayesian: {
      home: { attack: round(home.strength.attack, 3), attackSd: round(home.strength.attackSd, 3), defense: round(home.strength.defense, 3), defenseSd: round(home.strength.defenseSd, 3) },
      away: { attack: round(away.strength.attack, 3), attackSd: round(away.strength.attackSd, 3), defense: round(away.strength.defense, 3), defenseSd: round(away.strength.defenseSd, 3) },
    },
  };

  // --- Confianza por selección candidata y pick principal
  const confFor = (leg) => confidenceScore({ quality, modelProbs: modelProbsFor(leg), health: health[leg.market] ?? null, home, away });
  const candidates = CANDIDATE_LEGS.concat([{ market: '1X2', selection: 'X' }, { market: 'DC', selection: '12' }])
    .map((l) => ({ ...l, line: l.line ?? 0 }))
    .map((l) => ({ ...l, probability: marginal(output, l) }))
    .filter((l) => l.probability !== undefined && l.probability !== null)
    .map((l) => {
      const c = confFor(l);
      return { ...l, label: label(l, names), confidenceScore: c.score, confidenceGrade: c.grade, confidence: round(rankIndex(l.probability, c.score)), confidenceDetail: c };
    })
    .sort((a, b) => b.confidence - a.confidence);
  output.pick = candidates[0] ?? null;
  output.confidence = candidates[0] ? candidates[0].confidenceDetail : null;
  output.legConfidence = Object.fromEntries(candidates.map((c) => [legKey(c), c.confidenceScore]));
  output.alternatives = candidates.slice(1, 6).map(({ confidenceDetail, ...c }) => c);
  if (output.pick) delete output.pick.confidenceDetail;
  output.combinations = suggestCombinations(output);

  // --- Explicabilidad: aporte de cada factor a la probabilidad del favorito (ablación)
  const favKey = probabilities['1X2'][1] >= probabilities['1X2'][2] ? '1' : '2';
  const base = core.final1X2[favKey];
  const ablations = [
    ['noHome', 'Localía'], ['noElo', 'Diferencia de Elo'], ['neutralForm', 'Forma reciente'], ['neutralAttack', 'Potencia ofensiva'],
    ['neutralDefense', 'Solidez defensiva'], ['noXg', 'xG / xGA'], ['noH2H', 'Head to Head'], ['noRest', 'Descanso'],
  ];
  output.factors = {
    favorite: favKey === '1' ? names.home : names.away,
    selection: favKey,
    items: ablations.map(([k, name]) => ({ factor: name, delta: round(base - computeCore(ctx, { [k]: true }).final1X2[favKey], 4) }))
      .filter((x) => Math.abs(x.delta) >= 0.002)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    method: 'Ablación: diferencia en la probabilidad del favorito al neutralizar cada factor en todos los modelos.',
  };
  if (params.logisticModel) output.factors.logisticImportance = logistic.importance(params.logisticModel).slice(0, 6).map((x) => ({ ...x, weight: round(x.weight, 3) }));

  output.explanation = explain({ names, home, away, h2h, lambdas: core.lambdas, elo: output.elo, probs: probabilities, corners, cards });
  output.quality = quality;

  // --- Valor frente al mercado (cuotas reales)
  const market = impliedNoVig(oddsRows);
  const value = [];
  for (const [k, o] of market) {
    const [m, sel, line] = k.split('|');
    const leg = { market: m, selection: sel, line: Number(line) };
    const p = marginal(output, leg);
    if (p === undefined || p === null) continue;
    const conf = output.legConfidence[legKey(leg)] ?? confFor(leg).score;
    const v = evaluateValue({ leg: { ...leg, label: label(leg, names) }, probability: p, odds: o.odds, implied: o.implied, impliedNoVig: o.impliedNoVig, overround: o.overround, confidence: conf, health: health[m] ?? null, params });
    value.push(roundDeep(v));
  }
  value.sort((a, b) => Number(b.accepted) - Number(a.accepted) || b.ev - a.ev);
  output.value = value;

  // --- Validación obligatoria antes de guardar
  const errors = validateForecastOutput(output);
  if (errors.length) {
    recordError({ source: 'forecast', endpoint: match.id, error: errors.join('; '), impact: 'pronóstico descartado (no se guarda)' });
    return { status: 'invalid', matchInfo, inputs, quality, output: { match: matchInfo, status: 'invalid', reason: errors.join('; ') }, predictions: [] };
  }

  const predictions = flattenPredictions({ probabilities, raw, models: core.models, oddsRows, pick: output.pick, legConfidence: output.legConfidence, calibratedMarkets });
  inputs.lambdasBase = core.lambdas.base;
  return {
    status: 'ok', matchInfo, inputs, quality, output, predictions,
    modelPredictions: modelRows.map(([key, , p, l]) => ({ model: key, p, lambdaHome: l?.home ?? null, lambdaAway: l?.away ?? null })),
    valueBets: value,
  };
}

function flattenPredictions({ probabilities: probs, raw, models, oddsRows, pick, legConfidence = {}, calibratedMarkets = [] }) {
  const oddsMap = new Map(oddsRows.map((o) => [`${o.market}|${o.selection}|${o.line}`, o.decimal_odds]));
  const rows = [];
  const push = (market, selection, line, p, rawP, components) => {
    const leg = { market, selection, line };
    rows.push({
      market, selection, line, probability: round(p, 6), rawProbability: round(rawP ?? p, 6), calibrated: calibratedMarkets.includes(market),
      confidence: legConfidence[legKey(leg)] ?? null, components, odds: oddsMap.get(legKey(leg)) ?? null, isPick: pick && legKey(pick) === legKey(leg),
    });
  };
  const comp = (s) => Object.fromEntries(['poisson', 'elo', 'weighted', 'xg', 'logistic', 'classic', 'bivariate'].map((m) => [m, models[m] ? round(models[m][s], 6) : null]));
  for (const s of ['1', 'X', '2']) push('1X2', s, 0, probs['1X2'][s], raw['1X2'][s], comp(s));
  for (const s of ['1X', 'X2', '12']) push('DC', s, 0, probs.DC[s]);
  for (const [line, p] of Object.entries(probs.OU.over)) {
    push('OU', 'over', Number(line), p, raw.OU.over[line]);
    if (Number(line) > 0.5) push('OU', 'under', Number(line), 1 - p, 1 - raw.OU.over[line]);
  }
  push('BTTS', 'yes', 0, probs.BTTS.yes, raw.BTTS.yes);
  push('BTTS', 'no', 0, probs.BTTS.no, 1 - raw.BTTS.yes);
  for (const side of ['home', 'away']) for (const [line, p] of Object.entries(probs.TEAM_OU[side])) push('TEAM_OU', side, Number(line), p);
  for (const [mk, lines] of [['CORNERS', CORNER_LINES], ['CARDS', CARD_LINES]]) {
    if (!probs[mk]) continue;
    for (const line of lines) {
      push(mk, 'over', line, probs[mk].over[line], raw[mk][line]);
      push(mk, 'under', line, 1 - probs[mk].over[line], 1 - raw[mk][line]);
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

/** Salud reciente de cada mercado (últimas 500 liquidaciones): base del score de confianza y de los descartes. */
function marketHealth(repos) {
  const out = {};
  const rows = repos.settledPredictions({ limit: 6000 });
  const by = {};
  for (const r of rows) (by[r.market] ??= []).length < 500 && by[r.market].push(r);
  for (const [m, list] of Object.entries(by)) {
    const bm = binaryMetrics(list);
    const ce = calibration.calibrationError(list);
    out[m] = { n: list.length, ece: ce.ece, brierSkill: bm.brierSkill };
  }
  return out;
}

/**
 * Pronostica todos los partidos aún no iniciados de una franja horaria.
 * Los partidos ya comenzados conservan su último pronóstico pre-partido (sin fuga de información).
 */
function runForecasts(fromSec, toSec, { repos, now = Math.floor(Date.now() / 1000), includeStarted = false } = {}) {
  const t0 = Date.now();
  const params = getModelParams(repos);
  const ratings = computeRatings(repos.allFinishedMatches(fromSec));
  const health = marketHealth(repos);
  const matches = repos.matchesBetween(fromSec, toSec);
  const summary = { total: matches.length, forecasted: 0, insufficient: 0, invalid: 0, skippedStarted: 0, errors: 0 };
  const snap = new Set();
  for (const m of matches) {
    if (!includeStarted && (m.status !== 'notstarted' || m.start_time <= now)) { summary.skippedStarted += 1; continue; }
    try {
      const r = forecastMatch(m, { repos, ratings, params, health });
      if (r.status === 'invalid') { summary.invalid += 1; continue; }
      repos.saveForecast({
        matchId: m.id, modelVersion: config.model.version,
        params: { ensemble: r.output.models?.ensembleWeights ?? params.ensemble, rho: params.dixonColesRho, weightedFactors: params.weightedFactors, learned: params.learned, calibration: Object.keys(params.calibration || {}) },
        inputs: r.inputs, output: r.output, quality: r.quality, modelPredictions: r.modelPredictions, valueBets: r.valueBets,
      }, r.predictions);
      for (const t of [m.home_team_id, m.away_team_id]) {
        if (!snap.has(t) && ratings.get(t) && repos.saveEloSnapshot) { repos.saveEloSnapshot(t, ratings.get(t)); snap.add(t); }
      }
      if (r.status === 'ok') {
        summary.forecasted += 1;
        logPrediction({ matchId: m.id, match: `${m.home_name} vs ${m.away_name}`, start: m.start_time, p1X2: r.output.probabilities['1X2'], pick: r.output.pick?.label, probability: r.output.pick?.probability, confidence: r.output.confidence?.score });
      } else summary.insufficient += 1;
    } catch (err) {
      summary.errors += 1;
      log.error(`Error pronosticando ${m.id}`, { error: err.message, endpoint: m.id, impact: 'partido sin pronóstico' });
    }
  }
  summary.ms = Date.now() - t0;
  log.info('Pronósticos generados', summary);
  return summary;
}

module.exports = { forecastMatch, runForecasts, rescaleMatrix, flattenPredictions, computeCore, marketHealth };
