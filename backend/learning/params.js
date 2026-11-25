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
  p.learned = learned;
  return p;
}

module.exports = { getModelParams };
