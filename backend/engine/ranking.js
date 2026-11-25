'use strict';
/**
 * Rankings del día a partir de los pronósticos guardados (solo status 'ok').
 * Cada entrada incluye probabilidad, índice de confianza y calidad del dato.
 */
const { round } = require('../lib/math');
const { label } = require('./markets');
const { marginal } = require('./combinations');
const { confidenceIndex } = require('./quality');

function entry(f, leg, extra = {}) {
  const o = f.output;
  const p = marginal(o, leg);
  return {
    matchId: o.match.id, match: `${o.match.home} vs ${o.match.away}`, tournament: o.match.tournament, startTime: o.match.startTime,
    market: leg.market, selection: leg.selection, line: leg.line ?? 0, label: label(leg, { home: o.match.home, away: o.match.away }),
    probability: round(p), confidence: round(confidenceIndex(p, f.quality.score)), quality: f.quality.grade, qualityScore: f.quality.score,
    ...extra,
  };
}

function topBy(forecasts, leg, n = 10) {
  return forecasts
    .filter((f) => marginal(f.output, leg) != null)
    .map((f) => entry(f, leg))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, n);
}

function buildRankings(allForecasts, n = 10) {
  const forecasts = allForecasts.filter((f) => f.output?.status === 'ok');
  const confidence = forecasts
    .filter((f) => f.output.pick)
    .map((f) => entry(f, f.output.pick))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, n);

  const value = forecasts
    .flatMap((f) => (f.output.value || []).filter((v) => v.ev > 0 && v.probability >= 0.3).map((v) => entry(f, v, { odds: v.odds, ev: v.ev, kellyQuarter: v.kellyQuarter })))
    .sort((a, b) => b.ev - a.ev)
    .slice(0, n);

  const combinations = forecasts
    .flatMap((f) => (f.output.combinations || []).slice(0, 1).map((c) => ({
      matchId: f.output.match.id, match: `${f.output.match.home} vs ${f.output.match.away}`, tournament: f.output.match.tournament,
      startTime: f.output.match.startTime, label: c.label, legs: c.individual, probability: round(c.joint), risk: c.risk,
      fairOdds: round(c.fairOdds, 2), confidence: round(confidenceIndex(c.joint, f.quality.score)), quality: f.quality.grade, assumptions: c.assumptions,
    })))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, n);

  return {
    confidence,
    value,
    combinations,
    btts: topBy(forecasts, { market: 'BTTS', selection: 'yes', line: 0 }, n),
    over: topBy(forecasts, { market: 'OU', selection: 'over', line: 2.5 }, n),
    under: topBy(forecasts, { market: 'OU', selection: 'under', line: 2.5 }, n),
    corners: topBy(forecasts, { market: 'CORNERS', selection: 'over', line: 8.5 }, n),
    cards: topBy(forecasts, { market: 'CARDS', selection: 'over', line: 3.5 }, n),
    meta: { forecasts: forecasts.length, withOdds: forecasts.filter((f) => f.quality.oddsAvailable).length },
  };
}

module.exports = { buildRankings };
