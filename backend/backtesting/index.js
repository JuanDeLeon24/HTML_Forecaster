'use strict';
/**
 * Backtesting sobre predicciones ya liquidadas (todas emitidas antes del partido).
 * Estrategias:
 *   pick_principal      1 unidad al pick principal si tiene cuota registrada
 *   value_bets          stake sugerido (Kelly fraccional) en las apuestas de valor aceptadas
 *   modelo:<nombre>     1X2: 1 unidad a la selección con mayor EV positivo según ese modelo
 * Métricas: apuestas, aciertos, fallos, stake total, beneficio, ROI (beneficio / banca inicial),
 * Yield (beneficio / stake total), drawdown máximo y curva de capital.
 */
function summarize(bets, bankroll) {
  let profit = 0, staked = 0, peak = 0, maxDd = 0, wins = 0;
  const curve = [];
  for (const b of bets.slice().sort((x, y) => x.t - y.t)) {
    const pnl = b.outcome ? b.stake * (b.odds - 1) : -b.stake;
    profit += pnl; staked += b.stake;
    if (b.outcome) wins++;
    peak = Math.max(peak, profit);
    maxDd = Math.max(maxDd, peak - profit);
    curve.push({ t: b.t, profit });
  }
  return {
    totalBets: bets.length, wins, losses: bets.length - wins, staked, profit,
    roi: bankroll ? profit / bankroll : null, yield: staked ? profit / staked : null, maxDrawdown: maxDd, curve,
  };
}

function runBacktests({ predictions, valueBets, bankroll = 100 }) {
  const out = {};
  out.pick_principal = summarize(predictions.filter((p) => p.is_pick && p.odds).map((p) => ({ t: p.start_time, stake: 1, odds: p.odds, outcome: p.outcome })), bankroll);
  out.value_bets = summarize(valueBets.filter((v) => v.accepted && v.outcome !== null).map((v) => ({ t: v.start_time, stake: v.stake, odds: v.odds, outcome: v.outcome })), bankroll);

  // Por modelo (1X2)
  const groups = new Map();
  for (const p of predictions) {
    if (p.market !== '1X2' || !p.odds || !p.components_json) continue;
    if (!groups.has(p.forecast_id)) groups.set(p.forecast_id, []);
    groups.get(p.forecast_id).push(p);
  }
  const perModel = {};
  for (const rows of groups.values()) {
    if (rows.length !== 3) continue;
    const comps = rows.map((r) => JSON.parse(r.components_json));
    for (const model of Object.keys(comps[0])) {
      let best = null;
      rows.forEach((r, i) => {
        const p = comps[i][model];
        if (p === null || p === undefined) return;
        const ev = p * r.odds - 1;
        if (ev > 0 && (!best || ev > best.ev)) best = { ev, r };
      });
      if (!best) continue;
      (perModel[model] ??= []).push({ t: best.r.start_time, stake: 1, odds: best.r.odds, outcome: best.r.outcome });
    }
  }
  for (const [m, bets] of Object.entries(perModel)) out[`modelo:${m}`] = summarize(bets, bankroll);
  return out;
}

module.exports = { runBacktests, summarize };
