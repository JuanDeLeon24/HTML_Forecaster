'use strict';
/**
 * Registro de proveedores. Para añadir una fuente nueva:
 *   1. Crear providers/<nombre>/client.js extendiendo BaseProvider.
 *   2. Registrarla aquí.
 *   3. DATA_PROVIDER=<nombre> en .env
 */
const config = require('../config');
const { SofascoreProvider } = require('./sofascore/client');

const registry = {
  sofascore: () => new SofascoreProvider(),
  // 'api-football': () => new ApiFootballProvider(),   // futuro
  // 'football-data': () => new FootballDataProvider(), // futuro
};

let current = null;
function getProvider(name = config.provider) {
  if (current && current.name === name) return current;
  const factory = registry[name];
  if (!factory) throw new Error(`Proveedor desconocido: ${name}. Disponibles: ${Object.keys(registry).join(', ')}`);
  current = factory();
  return current;
}
function setProvider(p) { current = p; }

module.exports = { getProvider, setProvider, registry };
