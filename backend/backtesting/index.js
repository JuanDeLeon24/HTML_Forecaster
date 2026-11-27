'use strict';
/**
 * Backtesting (estructura base v0.4.0). Implementación completa en etapas 6/7.
 */
function roi(bets) {
  const profit = bets.reduce((s, b) => s + (b.outcome ? (b.odds ?? 1) - 1 : -1), 0);
  return { bets: bets.length, profit, roi: bets.length ? profit / bets.length : null };
}

function yieldMetric(bets) {
  const staked = bets.reduce((s, b) => s + (b.stake ?? 1), 0);
  const profit = bets.reduce((s, b) => s + (b.outcome ? (b.odds ?? 1) - 1 : -1) * (b.stake ?? 1), 0);
  return { staked, profit, yield: staked ? profit / staked : null };
}

function capitalCurve(bets) {
  let capital = 0, peak = 0, maxDrawdown = 0;
  const curve = [];
  for (const b of bets.slice().sort((a, c) => (a.time ?? 0) - (c.time ?? 0))) {
    const delta = (b.outcome ? (b.odds ?? 1) - 1 : -1) * (b.stake ?? 1);
    capital += delta;
    peak = Math.max(peak, capital);
    maxDrawdown = Math.max(maxDrawdown, peak - capital);
    curve.push({ time: b.time ?? null, capital });
  }
  return { curve, finalCapital: capital, maxDrawdown };
}

function clv(bets) {
  // Closing Line Value: (closingOdds / openingOdds) - 1, promedio.
  const vals = bets.filter((b) => b.openingOdds && b.closingOdds).map((b) => b.closingOdds / b.openingOdds - 1);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

module.exports = { roi, yieldMetric, capitalCurve, clv };
