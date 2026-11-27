'use strict';
/**
 * Score de confianza 0–100 (especificación Enterprise). Factores y pesos:
 *   40  calidad del dato          (engine/quality.js)
 *   20  acuerdo entre modelos     1 − dispersión (desv. típica de la probabilidad entre modelos / 0.15)
 *   15  calibración reciente      del mercado: 1 − ECE/0.10 (neutral 0.5 sin muestra ≥ 100)
 *   15  precisión reciente        del mercado: 0.5 + Brier Skill (neutral 0.5 sin muestra ≥ 100)
 *   10  consistencia histórica    de ambos equipos: 1 − |pts/p últimos 5 − últimos 20| / 3
 * Niveles: A+ ≥ 90 · A 80–89 · B 70–79 · C 60–69 · D < 60.
 */
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function grade(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

function std(values) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

/**
 * @param quality     salida de assessQuality
 * @param modelProbs  probabilidad de la selección según cada modelo disponible
 * @param health      { n, ece, brierSkill } del mercado (predicciones liquidadas recientes) o null
 * @param home/away   perfiles de equipo
 */
function confidenceScore({ quality, modelProbs, health, home, away }) {
  const dispersion = std(modelProbs);
  const agreement = dispersion === null ? 0.5 : clamp01(1 - dispersion / 0.15);
  const enough = health && health.n >= 100;
  const calibration = enough && health.ece !== null ? clamp01(1 - health.ece / 0.1) : 0.5;
  const precision = enough && health.brierSkill !== null ? clamp01(0.5 + health.brierSkill) : 0.5;
  const cons = (t) => (t.last5.ppg !== null && t.last20.ppg !== null ? 1 - Math.abs(t.last5.ppg - t.last20.ppg) / 3 : 0.5);
  const consistency = clamp01((cons(home) + cons(away)) / 2);
  const factors = {
    dataQuality: 40 * quality.score / 100,
    modelAgreement: 20 * agreement,
    calibration: 15 * calibration,
    recentPrecision: 15 * precision,
    consistency: 10 * consistency,
  };
  const score = Math.round(Object.values(factors).reduce((a, b) => a + b, 0));
  return { score, grade: grade(score), factors: Object.fromEntries(Object.entries(factors).map(([k, v]) => [k, Math.round(v * 10) / 10])), dispersion, marketSample: health?.n ?? 0 };
}

/** Índice para ordenar rankings: probabilidad ponderada por la confianza. */
const rankIndex = (p, score) => p * (0.5 + 0.5 * score / 100);

module.exports = { confidenceScore, grade, rankIndex };
