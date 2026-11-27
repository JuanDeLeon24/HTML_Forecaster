'use strict';
/**
 * Validación de datos antes de persistir (Fase 1 Enterprise).
 * Lanza ValidationError si el dato es imposible o corrupto.
 */
class ValidationError extends Error {
  constructor(message, context) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.context = context;
  }
}

function isFiniteOrNull(v) {
  if (v === null || v === undefined) return true;
  return typeof v === 'number' && Number.isFinite(v);
}

function requireFinite(v, field) {
  if (!Number.isFinite(v)) throw new ValidationError(`${field} debe ser un número finito`, { field, value: v });
}

function nonNegativeOrNull(v, field) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new ValidationError(`${field} no puede ser negativo ni NaN/Infinity`, { field, value: v });
  return v;
}

function probabilityOrNull(v, field) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) throw new ValidationError(`${field} debe estar en [0,1]`, { field, value: v });
  return v;
}

const ALLOWED_STATUSES = new Set(['notstarted', 'inprogress', 'finished', 'postponed', 'canceled', 'unknown']);

function validateMatch(m) {
  if (!m || !m.id) throw new ValidationError('Partido sin id', { match: m });
  if (!m.provider) throw new ValidationError('Partido sin provider', { id: m.id });
  if (!Number.isFinite(m.startTime)) throw new ValidationError('startTime inválido', { id: m.id, startTime: m.startTime });
  if (!ALLOWED_STATUSES.has(m.status)) throw new ValidationError('status inválido', { id: m.id, status: m.status });
  if (!m.home?.id || !m.away?.id) throw new ValidationError('Equipos inválidos', { id: m.id });
  if (m.homeGoals !== null && m.homeGoals !== undefined) {
    if (!Number.isInteger(m.homeGoals) || m.homeGoals < 0) throw new ValidationError('homeGoals inválido', { id: m.id, homeGoals: m.homeGoals });
  }
  if (m.awayGoals !== null && m.awayGoals !== undefined) {
    if (!Number.isInteger(m.awayGoals) || m.awayGoals < 0) throw new ValidationError('awayGoals inválido', { id: m.id, awayGoals: m.awayGoals });
  }
  return true;
}

function validateOdds(o) {
  if (!o || !o.market || !o.selection) throw new ValidationError('Cuota inválida', { odds: o });
  if (!Number.isFinite(o.decimalOdds) || o.decimalOdds <= 1) throw new ValidationError('decimalOdds inválido', { odds: o });
  if (o.line !== undefined && o.line !== null && !Number.isFinite(o.line)) throw new ValidationError('line inválido', { odds: o });
  return true;
}

function validateStats(s) {
  if (!s) return true;
  for (const k of Object.keys(s)) {
    if (k === 'available') continue;
    const v = s[k];
    if (v !== null && v !== undefined && !Number.isFinite(v)) throw new ValidationError(`Stat ${k} no finita`, { key: k, value: v });
    if (typeof v === 'number' && v < 0 && !k.toLowerCase().includes('possession')) {
      throw new ValidationError(`Stat ${k} negativa`, { key: k, value: v });
    }
  }
  return true;
}

module.exports = { ValidationError, validateMatch, validateOdds, validateStats, nonNegativeOrNull, probabilityOrNull, isFiniteOrNull, requireFinite };
