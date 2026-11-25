'use strict';
/**
 * Calidad del dato (0–100) y nivel de confianza. Se muestra SIEMPRE junto al pronóstico.
 *   45 pts  tamaño de muestra de goles (mín. de ambos equipos, satura en 15 partidos)
 *   20 pts  cobertura de estadísticas (corners/tarjetas, satura en 8)
 *   10 pts  H2H (satura en 5)
 *   15 pts  frescura (último partido jugado ≤ 21 días = 15, ≤ 60 = 7)
 *   10 pts  tamaño del pool de normalización (satura en 200 partidos)
 */
const config = require('../config');

function assessQuality({ home, away, h2h, baseline, refTime, oddsCount }, params = config.model) {
  const nMin = Math.min(home.n, away.n);
  const sMin = Math.min(home.corners.n, away.corners.n);
  const latest = Math.min(home.latestMatchTime ?? 0, away.latestMatchTime ?? 0);
  const staleDays = latest ? Math.round((refTime - latest) / 86400) : null;
  const parts = {
    sample: 45 * Math.min(1, nMin / 15),
    stats: 20 * Math.min(1, sMin / 8),
    h2h: 10 * Math.min(1, h2h.n / 5),
    freshness: staleDays === null ? 0 : staleDays <= 21 ? 15 : staleDays <= 60 ? 7 : 0,
    pool: 10 * Math.min(1, (baseline.n ?? 0) / 200),
  };
  const score = Math.round(Object.values(parts).reduce((a, b) => a + b, 0));
  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
  const warnings = [];
  if (nMin < 10) warnings.push(`Muestra corta: ${home.n} partidos del local y ${away.n} del visitante.`);
  if (sMin < params.minStatsSample) warnings.push('Sin estadísticas suficientes de corners/tarjetas: esos mercados no se pronostican.');
  if (h2h.n === 0) warnings.push('Sin enfrentamientos directos registrados.');
  if (staleDays !== null && staleDays > 60) warnings.push(`El dato más reciente de uno de los equipos tiene ${staleDays} días.`);
  if (baseline.scope === 'global') warnings.push('Medias de normalización calculadas con el pool global (poca muestra del torneo).');
  if (baseline.scope === 'prior') warnings.push('Base de datos casi vacía: medias de normalización por defecto.');
  return {
    score, grade, parts,
    insufficient: nMin < params.minTeamSample,
    samples: { home: home.n, away: away.n, homeStats: home.corners.n, awayStats: away.corners.n, h2h: h2h.n, pool: baseline.n ?? 0, poolScope: baseline.scope },
    staleDays, oddsAvailable: oddsCount > 0, warnings,
  };
}

/** Índice de confianza de una selección: probabilidad ponderada por la calidad del dato. */
const confidenceIndex = (p, qualityScore) => p * (0.5 + 0.5 * qualityScore / 100);

module.exports = { assessQuality, confidenceIndex };
