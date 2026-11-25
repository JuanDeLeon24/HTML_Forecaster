'use strict';
/**
 * Valor esperado frente a cuotas reales del mercado (si existen).
 *   EV = p · cuota − 1
 *   Probabilidad implícita sin margen: (1/cuota) / Σ(1/cuota) del mercado
 *   Kelly fraccional (¼) como referencia de gestión de riesgo, nunca como consejo.
 */
function impliedNoVig(oddsRows) {
  const groups = new Map();
  for (const o of oddsRows) {
    const key = `${o.market}|${o.line}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  const out = new Map();
  for (const rows of groups.values()) {
    const complete = rows[0].market === 'DC' ? false : true; // DC no es un mercado de suma 1
    const s = rows.reduce((a, r) => a + 1 / r.decimal_odds, 0);
    for (const r of rows) {
      out.set(`${r.market}|${r.selection}|${r.line}`, {
        odds: r.decimal_odds,
        implied: 1 / r.decimal_odds,
        impliedNoVig: complete && s > 0 ? (1 / r.decimal_odds) / s : null,
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

module.exports = { impliedNoVig, valueOf };
