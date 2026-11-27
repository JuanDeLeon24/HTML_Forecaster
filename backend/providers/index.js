'use strict';
/**
 * Registro de proveedores. Para añadir una fuente nueva:
 *   1. Crear providers/<nombre>/client.js extendiendo BaseProvider.
 *   2. Registrarla aquí.
 *   3. DATA_PROVIDER=<nombre> en .env
 */
const config = require('../config');
const { SofascoreProvider } = require('./sofascore/client');
const { FootballDataProvider } = require('./footballData/client');
const { ApiFootballProvider } = require('./apiFootball/client');
const { FailoverProvider } = require('./fallback');

const registry = {
  sofascore: () => new SofascoreProvider(),
  'football-data': () => new FootballDataProvider(),
  'api-football': () => new ApiFootballProvider(),
};

let current = null;
function getProvider(name = config.provider) {
  if (current && current.name === name && !config.fallbackProvider) return current;
  const factory = registry[name];
  if (!factory) throw new Error(`Proveedor desconocido: ${name}. Disponibles: ${Object.keys(registry).join(', ')}`);
  const primary = factory();
  if (config.fallbackProvider && registry[config.fallbackProvider]) {
    const fallback = registry[config.fallbackProvider]();
    current = new FailoverProvider([primary, fallback]);
    return current;
  }
  current = primary;
  return current;
}
function setProvider(p) { current = p; }

module.exports = { getProvider, setProvider, registry };
