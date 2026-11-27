'use strict';
/**
 * Valor esperado frente a cuotas reales del mercado (si existen).
 *   EV = p · cuota − 1
 *   Probabilidad implícita sin margen: (1/cuota) / Σ(1/cuota) del mercado
 *   Kelly fraccional (¼) como referencia de gestión de riesgo, nunca como consejo.
 */
function impliedNoVig(oddsRows) {
  // Probabilidades sin margen del 1X2, usadas para derivar DC sin margen.
  const oneX2 = oddsRows.filter((o) => o.market === '1X2');
  let base = null;
  if (oneX2.length === 3) {
    const s = oneX2.reduce((a, r) => a + 1 / r.decimal_odds, 0);
    if (s > 0) {
      base = {};
      for (const r of oneX2) base[r.selection] = (1 / r.decimal_odds) / s;
    }
  }

  const groups = new Map();
  for (const o of oddsRows) {
    const key = `${o.market}|${o.line}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  const out = new Map();
  for (const rows of groups.values()) {
    const isDC = rows[0].market === 'DC';
    const complete = !isDC;
    const s = rows.reduce((a, r) => a + 1 / r.decimal_odds, 0);
    for (const r of rows) {
      let inv = null;
      if (isDC && base) {
        if (r.selection === '1X') inv = (base['1'] ?? 0) + (base['X'] ?? 0);
        else if (r.selection === 'X2') inv = (base['X'] ?? 0) + (base['2'] ?? 0);
        else if (r.selection === '12') inv = (base['1'] ?? 0) + (base['2'] ?? 0);
      } else if (complete && s > 0) {
        inv = (1 / r.decimal_odds) / s;
      }
      out.set(`${r.market}|${r.selection}|${r.line}`, {
        odds: r.decimal_odds,
        implied: 1 / r.decimal_odds,
        impliedNoVig: inv,
        overround: complete ? s - 1 : null,
      });
    }
  }
  return out;
}

function valueOf(probability, odds) {
  const ev = probability * odds - 1;
  const b = odds - 1;
  const kelly = b > 0 ? Math.max(0, (b * probability - (1 - probability)) / b) : 0;
  return { ev, kellyQuarter: kelly / 4 };
}

function exposureLimit(bets, maxPerDay = 5, maxPerMatch = 1) {
  const byMatch = new Map();
  const out = [];
  let dayCount = 0;
  for (const b of bets) {
    const mc = byMatch.get(b.matchId) ?? 0;
    if (dayCount >= maxPerDay) continue;
    if (mc >= maxPerMatch) continue;
    byMatch.set(b.matchId, mc + 1);
    dayCount += 1;
    out.push(b);
  }
  return out;
}

function correlated(a, b) {
  // Selecciones del mismo partido y misma familia se consideran correlacionadas.
  if (a.matchId !== b.matchId) return false;
  const fam = (m) => ({ '1X2': 'result', DC: 'result', OU: 'goals', BTTS: 'btts', CORNERS: 'corners', CARDS: 'cards', TEAM_OU: 'teamgoals' }[m] || m);
  return fam(a.market) === fam(b.market);
}

module.exports = { impliedNoVig, valueOf, exposureLimit, correlated };
