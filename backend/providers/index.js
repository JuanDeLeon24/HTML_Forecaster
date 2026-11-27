'use strict';
/**
 * Registro de proveedores. Para añadir una fuente nueva:
 *   1. Crear providers/<nombre>/client.js extendiendo BaseProvider.
 *   2. Registrarla aquí.
 *   3. DATA_PROVIDER=<nombre> en .env (y opcionalmente FALLBACK_PROVIDER=<otro>).
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
let override = null;
function getProvider(name = config.provider) {
  if (override) return override;
  if (current && current.key === name) return current;
  const factory = registry[name];
  if (!factory) throw new Error(`Proveedor desconocido: ${name}. Disponibles: ${Object.keys(registry).join(', ')}`);
  const primary = factory();
  const fb = config.fallbackProvider && config.fallbackProvider !== name ? registry[config.fallbackProvider] : null;
  current = fb ? new FailoverProvider([primary, fb()]) : primary;
  current.key = name;
  return current;
}
/** Fija un proveedor concreto (archivo único, pruebas o importación desde archivo). */
function setProvider(p) { override = p; }

module.exports = { getProvider, setProvider, registry };
