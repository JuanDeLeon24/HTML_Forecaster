'use strict';
/**
 * Validación obligatoria de datos antes de guardarlos o usarlos.
 * Reglas: sin null inesperados, undefined, NaN ni Infinity; sin negativos en métricas que no
 * los admiten; probabilidades en [0, 1]; cuotas decimales > 1; fechas plausibles; IDs válidos.
 * Un dato inválido se rechaza (partido/cuota) o se anula ese campo (estadística), y se registra
 * en logs/errors.log con origen, endpoint, error e impacto.
 */
const { recordError } = require('../lib/logger');

const STATUSES = new Set(['notstarted', 'inprogress', 'finished', 'postponed', 'canceled', 'unknown']);
const MIN_TS = Date.UTC(1990, 0, 1) / 1000;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isId = (x) => typeof x === 'string' && /^[a-z0-9_-]+:[a-z]+:[A-Za-z0-9_-]+$/.test(x);
const isGoal = (x) => Number.isInteger(x) && x >= 0 && x <= 30;

class ValidationError extends Error {
  constructor(errors) { super(errors.join('; ')); this.errors = errors; }
}

function validateMatch(m) {
  const e = [];
  if (!m || typeof m !== 'object') return ['partido vacío'];
  if (!isId(m.id)) e.push(`id de partido inválido: ${m.id}`);
  if (!m.home || !isId(m.home.id)) e.push(`id de equipo local inválido: ${m.home?.id}`);
  if (!m.away || !isId(m.away.id)) e.push(`id de equipo visitante inválido: ${m.away?.id}`);
  if (m.home?.id && m.home.id === m.away?.id) e.push('local y visitante son el mismo equipo');
  if (!m.home?.name || !m.away?.name) e.push('nombre de equipo vacío');
  const maxTs = Date.now() / 1000 + 2 * 365 * 86400;
  if (!isNum(m.startTime) || m.startTime < MIN_TS || m.startTime > maxTs) e.push(`fecha/hora inválida: ${m.startTime}`);
  if (!STATUSES.has(m.status)) e.push(`estado desconocido: ${m.status}`);
  if (m.tournament && (!m.tournament.id || !m.tournament.name)) e.push('torneo incompleto');
  if (m.status === 'finished') {
    if (!isGoal(m.homeGoals) || !isGoal(m.awayGoals)) e.push(`resultado inválido en partido terminado: ${m.homeGoals}-${m.awayGoals}`);
  } else if ((m.homeGoals ?? null) !== null || (m.awayGoals ?? null) !== null) {
    e.push('partido no terminado con marcador final');
  }
  return e;
}

const STAT_RULES = {
  Corners: [0, 40], Yellow: [0, 15], Red: [0, 5], Shots: [0, 60], Sot: [0, 40], Possession: [0, 100], Fouls: [0, 60], Xg: [0, 10],
};

/** Devuelve una copia saneada: campos inválidos → null; posesión que no suma ~100 → null. */
function sanitizeStats(s, ctx = {}) {
  if (!s || !s.available) return { available: false };
  const out = { available: true };
  const bad = [];
  for (const [k, [lo, hi]] of Object.entries(STAT_RULES)) {
    for (const side of ['home', 'away']) {
      const key = `${side}${k}`;
      const v = s[key];
      if (v === undefined || v === null) { out[key] = null; continue; }
      if (!isNum(v) || v < lo || v > hi) { bad.push(`${key}=${v}`); out[key] = null; } else out[key] = v;
    }
  }
  if (out.homePossession !== null && out.awayPossession !== null && Math.abs(out.homePossession + out.awayPossession - 100) > 2) {
    bad.push(`posesión ${out.homePossession}+${out.awayPossession}`); out.homePossession = out.awayPossession = null;
  }
  if (out.homeSot !== null && out.homeShots !== null && out.homeSot > out.homeShots) { bad.push('tiros al arco > tiros (local)'); out.homeSot = null; }
  if (out.awaySot !== null && out.awayShots !== null && out.awaySot > out.awayShots) { bad.push('tiros al arco > tiros (visitante)'); out.awaySot = null; }
  if (bad.length) recordError({ source: ctx.source ?? 'validator', endpoint: ctx.endpoint ?? null, error: `estadísticas inválidas: ${bad.join(', ')}`, impact: 'campos anulados; el resto de estadísticas se conserva' });
  if (out.homeCorners === null && out.homeYellow === null && out.homeXg === null) out.available = false;
  return out;
}

function validateOdds(o) {
  const e = [];
  if (!['1X2', 'DC', 'OU', 'BTTS'].includes(o.market)) e.push(`mercado desconocido ${o.market}`);
  if (!isNum(o.decimalOdds) || o.decimalOdds <= 1.001 || o.decimalOdds > 1000) e.push(`cuota inválida ${o.decimalOdds}`);
  if (o.line !== undefined && o.line !== null && (!isNum(o.line) || o.line < 0)) e.push(`línea inválida ${o.line}`);
  return e;
}

const isProbability = (p) => isNum(p) && p >= 0 && p <= 1;

/** Recorre un objeto de probabilidades y devuelve las rutas inválidas. */
function invalidProbabilities(obj, pathPrefix = '') {
  const bad = [];
  if (obj === null || obj === undefined) return bad;
  if (typeof obj === 'number') return isProbability(obj) ? bad : [pathPrefix || '(raíz)'];
  if (typeof obj === 'object') for (const [k, v] of Object.entries(obj)) {
    if (k === 'expected') { if (!isNum(v) || v < 0) bad.push(`${pathPrefix}.${k}`); continue; }
    bad.push(...invalidProbabilities(v, pathPrefix ? `${pathPrefix}.${k}` : k));
  }
  return bad;
}

/** Comprueba la salida completa de un pronóstico antes de persistirla. */
function validateForecastOutput(output) {
  const e = [];
  const bad = invalidProbabilities(output.probabilities);
  if (bad.length) e.push(`probabilidades fuera de [0,1] o no numéricas: ${bad.slice(0, 5).join(', ')}`);
  const p = output.probabilities?.['1X2'];
  if (p) {
    const s = p[1] + p.X + p[2];
    if (Math.abs(s - 1) > 0.005) e.push(`1X2 no suma 1 (${s})`);
  }
  for (const k of ['home', 'away']) if (!isNum(output.lambdas?.[k]) || output.lambdas[k] <= 0) e.push(`λ ${k} inválido`);
  if (output.confidence && (!isNum(output.confidence.score) || output.confidence.score < 0 || output.confidence.score > 100)) e.push('confianza fuera de 0–100');
  return e;
}

module.exports = { validateMatch, sanitizeStats, validateOdds, validateForecastOutput, isProbability, invalidProbabilities, ValidationError };
