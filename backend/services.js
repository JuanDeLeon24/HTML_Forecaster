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
const { runBootstrap } = require('./collectors/bootstrap');
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

/** Carga inicial del histórico (temporadas completas de las competiciones seguidas). */
async function bootstrap(onProgress, options = {}) {
  return runBootstrap({ provider: getProvider(), repos: getRepos(), onProgress, ...options });
}

/** ¿La base tiene poco histórico? (menos de 500 partidos terminados) */
function needsBootstrap() { return getRepos().counts().finished < 500; }

/** Ciclo diario completo: liquidar → aprender → recolectar → pronosticar. */
async function daily(date, onProgress) {
  // Si la base está casi vacía, primero se carga el histórico completo (una sola vez)
  const bootstrapped = needsBootstrap() ? await bootstrap(onProgress).catch((e) => ({ error: e.message })) : null;
  const settled = await settle();
  const learned = learn();
  const collected = await collect(date, onProgress);
  const forecasted = forecast(date);
  return { bootstrapped, settled, learned, collected, forecasted };
}

module.exports = { getRepos, setRepos, dayRange, collect, forecast, settle, learn, daily, bootstrap, needsBootstrap };
