'use strict';
/**
 * Análisis en vivo con base estadística (no reglas fijas): a partir de los goles esperados
 * PRE-PARTIDO del pronóstico, el minuto y el marcador actual, la parte restante del partido se
 * modela como Poisson con λ_restante = λ × (minutos restantes / 90). Igual para corners y tarjetas.
 * Supuesto declarado: intensidad constante durante el partido (sin ajuste por expulsiones ni por
 * marcador); por eso el resultado es una referencia, no una recomendación automática.
 */
const { poissonPmf } = require('../lib/math');

/** Minuto estimado: tiempo desde el inicio menos el descanso, acotado a 90; o el último minuto registrado. */
function estimateMinute(match, incidents, now = Math.floor(Date.now() / 1000)) {
  const elapsed = (now - match.start_time) / 60;
  let byClock = null;
  if (elapsed > 0) byClock = elapsed <= 45 ? elapsed : elapsed <= 60 ? 45 : Math.min(90, elapsed - 15);
  const mins = (incidents || []).map((i) => i.minute).filter((m) => Number.isFinite(m));
  const byEvents = mins.length ? Math.max(...mins) : null;
  const m = Math.max(byClock ?? 0, byEvents ?? 0);
  return m > 0 ? Math.round(Math.min(90, m)) : null;
}

/** Distribución de goles restantes (truncada) para cada equipo. */
function remaining(lambda, frac, max = 8) {
  const l = Math.max(0, lambda * frac);
  return Array.from({ length: max + 1 }, (_, k) => poissonPmf(k, l));
}

function overProb(current, lambdaRest, line) {
  const need = Math.floor(line) + 1 - current;
  if (need <= 0) return 1;
  let cdf = 0;
  for (let k = 0; k < need; k++) cdf += poissonPmf(k, lambdaRest);
  return Math.max(0, 1 - cdf);
}

function analyzeLive(match, stats, incidents, forecastOutput = null, now) {
  const minute = estimateMinute(match, incidents, now);
  const has = !!(stats && stats.available === 1);
  const corners = has && stats.home_corners !== null && stats.away_corners !== null ? stats.home_corners + stats.away_corners : null;
  const cards = has && stats.home_yellow !== null && stats.away_yellow !== null ? stats.home_yellow + stats.away_yellow + (stats.home_red ?? 0) + (stats.away_red ?? 0) : null;
  const hg = match.home_goals ?? 0;
  const ag = match.away_goals ?? 0;
  const out = { minute, score: `${hg}-${ag}`, corners, cards, probabilities: null, signals: [], basis: null };
  if (!forecastOutput || forecastOutput.status !== 'ok' || minute === null) {
    out.basis = 'Sin pronóstico previo o sin minuto: no se calculan probabilidades en vivo.';
    return out;
  }
  const frac = Math.max(0, (90 - minute) / 90);
  const lh = forecastOutput.lambdas.home;
  const la = forecastOutput.lambdas.away;
  const rh = remaining(lh, frac);
  const ra = remaining(la, frac);
  let p1 = 0, px = 0, p2 = 0, btts = 0;
  for (let i = 0; i < rh.length; i++) for (let j = 0; j < ra.length; j++) {
    const p = rh[i] * ra[j];
    const fh = hg + i, fa = ag + j;
    if (fh > fa) p1 += p; else if (fh === fa) px += p; else p2 += p;
    if (fh > 0 && fa > 0) btts += p;
  }
  const t = p1 + px + p2;
  const lRest = (lh + la) * frac;
  const probs = {
    '1X2': { 1: p1 / t, X: px / t, 2: p2 / t },
    over: Object.fromEntries([0.5, 1.5, 2.5, 3.5].map((l) => [l, overProb(hg + ag, lRest, l)])),
    btts: btts / t,
  };
  const cExp = forecastOutput.corners?.available ? forecastOutput.corners.expected : null;
  if (cExp && corners !== null) probs.cornersOver = Object.fromEntries([8.5, 9.5, 10.5].map((l) => [l, overProb(corners, cExp * frac, l)]));
  const kExp = forecastOutput.cards?.available ? forecastOutput.cards.expected : null;
  if (kExp && cards !== null) probs.cardsOver = Object.fromEntries([3.5, 4.5].map((l) => [l, overProb(cards, kExp * frac, l)]));
  out.probabilities = probs;
  out.basis = `λ restante = λ pre-partido × ${(frac * 100).toFixed(0)}% del tiempo (Poisson, intensidad constante).`;
  const reds = (incidents || []).filter((i) => i.type === 'red_card');
  if (reds.length) out.signals.push(`Hay ${reds.length} expulsión(es): el modelo no las ajusta, interpreta con cautela.`);
  const pick = (label, p) => { if (p >= 0.8 && p < 0.999) out.signals.push(`${label}: ${(p * 100).toFixed(0)}%`); };
  pick('Gana local', probs['1X2'][1]); pick('Empate', probs['1X2'].X); pick('Gana visitante', probs['1X2'][2]);
  for (const [l, p] of Object.entries(probs.over)) { pick(`Más de ${l} goles`, p); pick(`Menos de ${l} goles`, 1 - p); }
  if (probs.cornersOver) for (const [l, p] of Object.entries(probs.cornersOver)) { pick(`Más de ${l} corners`, p); pick(`Menos de ${l} corners`, 1 - p); }
  return out;
}

module.exports = { analyzeLive, estimateMinute, overProb };
