'use strict';
/**
 * Parámetros de modelo por defecto (módulo puro, compartido por servidor y versión de archivo único).
 * El motor de aprendizaje puede sobrescribirlos (tabla model_params) cuando hay muestra suficiente.
 */
module.exports = {
  version: '0.6.0',
  // Nivel 1 – modelo ponderado (suma = 1)
  weightedFactors: { form: 0.35, h2h: 0.2, home: 0.1, attack: 0.2, defense: 0.15 },
  weightedSlope: 3.0,
  // Mezcla del 1X2 final entre modelos
  ensemble: { poisson: 0.4, elo: 0.2, weighted: 0.2, xg: 0.2, logistic: 0 },
  // Dixon-Coles: rho típico en la literatura entre -0.05 y -0.15
  dixonColesRho: -0.08,
  // Elo
  eloK: 20,
  eloHomeAdvantage: 65,
  eloInitial: 1500,
  // Tasa base de empates si no hay datos suficientes en la base
  baseDrawRate: 0.26,
  // Encogimiento bayesiano hacia la media (equivale a N partidos "promedio")
  shrinkageGames: 3,
  // Vida media del decaimiento temporal (días)
  decayHalfLifeDays: 180,
  // Peso máximo del H2H sobre el total de goles esperado
  h2hGoalsWeight: 0.15,
  maxGoals: 10,
  // Poisson bivariado: covarianza λ3 (Karlis & Ntzoufras encontraron valores pequeños, ~0.05–0.2)
  bivariateLambda3: 0.1,
  // xG: muestra mínima por equipo para usar el modelo xG/xGA
  minXgSample: 5,
  // Calibración: mínimo de predicciones por mercado para intentar recalibrar
  minCalibrationSample: 300,
  // Aprendizaje: mínimo de partidos 1X2 liquidados y fracción de validación (walk-forward)
  minLearningSample: 60,
  holdoutFraction: 0.3,
  // Regresión logística
  minLogisticSample: 200,
  logisticL2: 1.0,
  // Apuestas de valor
  bankroll: 100,
  kellyFraction: 0.25,
  maxStakePct: 0.05,
  minValueConfidence: 60,
  minEdge: 0.02,
  maxOverround: 0.08,
  // Exposición diaria: nº máximo de apuestas de valor y stake total máximo (fracción de la banca)
  maxBetsPerDay: 5,
  maxDailyStakePct: 0.15,
  // Muestra mínima por equipo para emitir pronóstico
  minTeamSample: 5,
  minStatsSample: 3,
  };
