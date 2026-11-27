'use strict';
/** Parámetros efectivos = configuración por defecto + valores aprendidos (si existen). */
const config = require('../config');

function getModelParams(repos) {
  const p = JSON.parse(JSON.stringify(config.model));
  const learned = {};
  const ens = repos.getParam('ensemble_weights');
  if (ens) { p.ensemble = ens.value; learned.ensemble = { sampleSize: ens.sampleSize, updatedAt: ens.updatedAt }; }
  const rho = repos.getParam('dixon_coles_rho');
  if (rho) { p.dixonColesRho = rho.value; learned.dixonColesRho = { sampleSize: rho.sampleSize, updatedAt: rho.updatedAt }; }
  const logisticModel = repos.getParam('logistic_model');
  if (logisticModel) { p.logisticModel = logisticModel.value; learned.logistic = { sampleSize: logisticModel.sampleSize, updatedAt: logisticModel.updatedAt }; }
  p.calibration = {};
  for (const market of ['1X2', 'OU', 'BTTS', 'CORNERS', 'CARDS']) {
    const c = repos.getParam(`calibration:${market}`);
    if (c && c.value.method !== 'none') { p.calibration[market] = c.value; learned[`calibration:${market}`] = { method: c.value.method, sampleSize: c.sampleSize }; }
  }
  // Si hay pesos aprendidos de una versión anterior (sin xG / logística) se completan con 0
  for (const k of Object.keys(config.model.ensemble)) if (p.ensemble[k] === undefined) p.ensemble[k] = 0;
  p.learned = learned;
  return p;
}

module.exports = { getModelParams };
