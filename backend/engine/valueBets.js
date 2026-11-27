'use strict';
/**
 * Detección de apuestas de valor.
 *   Value edge = P(modelo) − P(implícita sin margen)
 *   EV = P(modelo)·cuota − 1                (EV+ si > 0)
 *   Kelly = (b·p − q) / b, b = cuota − 1    Kelly fraccional = fracción · Kelly
 *   Stake sugerido = min(banca · Kelly fraccional, banca · tope)
 * Descartes automáticos (con motivo): EV ≤ 0, edge < mínimo, confianza baja, mercado mal calibrado
 * (Brier Skill < 0 o ECE > 0.06 con ≥ 100 liquidaciones) y poca liquidez (margen de la casa alto).
 */
function evaluateValue({ leg, probability, odds, implied, impliedNoVig, overround, confidence, health, params }) {
  const p = probability;
  const b = odds - 1;
  const ev = p * odds - 1;
  const ref = impliedNoVig ?? implied;
  const edge = p - ref;
  const kelly = b > 0 ? Math.max(0, (b * p - (1 - p)) / b) : 0;
  const fractional = kelly * params.kellyFraction;
  const stake = Math.min(params.bankroll * fractional, params.bankroll * params.maxStakePct);
  const reasons = [];
  if (ev <= 0) reasons.push('EV no positivo');
  else if (edge < params.minEdge) reasons.push(`edge ${(edge * 100).toFixed(1)}% < ${(params.minEdge * 100).toFixed(0)}%`);
  if (confidence < params.minValueConfidence) reasons.push(`confianza ${confidence} < ${params.minValueConfidence}`);
  if (health && health.n >= 100 && ((health.brierSkill !== null && health.brierSkill < 0) || (health.ece !== null && health.ece > 0.06))) reasons.push('mercado mal calibrado históricamente');
  if (overround !== null && overround > params.maxOverround) reasons.push(`margen de la casa ${(overround * 100).toFixed(1)}% (poca liquidez)`);
  return {
    ...leg, probability: p, odds, implied, impliedNoVig, edge, ev, evPositive: ev > 0, kelly, kellyFractional: fractional,
    stake: reasons.length ? 0 : Math.round(stake * 100) / 100, confidence, accepted: reasons.length === 0, discardReason: reasons.join('; ') || null,
  };
}

module.exports = { evaluateValue };
