'use strict';
/**
 * Casos de uso de la aplicación (capa de aplicación de Clean Architecture).
 * API HTTP, CLI y planificador usan estas funciones; no contienen lógica de dominio propia.
 */
const config = require('./config');
const { getDb } = require('./database/db');
const { createRepositories } = require('./database/repositories');
const { getProvider } = require('./providers');
const { runDailyCollection } = require('./collectors');
const { runForecasts } = require('./engine/forecast');
const { settlePending } = require('./validation/settle');
const { learnAll } = require('./learning/weights');
const { dayRange } = require('./lib/dates');

let repos = null;
function getRepos() {
  if (!repos) repos = createRepositories(getDb());
  return repos;
}
function setRepos(r) { repos = r; }

async function collect(date, onProgress, options = {}) {
  return runDailyCollection(date, { provider: getProvider(), repos: getRepos(), onProgress, options });
}

function forecast(date, opts = {}) {
  const [from, to] = dayRange(date);
  return runForecasts(from, to, { repos: getRepos(), ...opts });
}

async function settle() { return settlePending({ provider: getProvider(), repos: getRepos() }); }

function learn() { return learnAll(getRepos()); }

/** Ciclo diario completo: liquidar → aprender → recolectar → pronosticar. */
async function daily(date, onProgress) {
  const settled = await settle();
  const learned = learn();
  const collected = await collect(date, onProgress);
  const forecasted = forecast(date);
  return { settled, learned, collected, forecasted };
}

module.exports = { getRepos, setRepos, dayRange, collect, forecast, settle, learn, daily };
