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
const { shiftDate } = require('./lib/dates');

let repos = null;
function getRepos() {
  if (!repos) repos = createRepositories(getDb());
  return repos;
}
function setRepos(r) { repos = r; }

/** Rango [inicio, fin) en unix para una fecha local en config.timezone. */
function dayRange(date, tz = config.timezone) {
  const probe = (iso) => {
    // Busca el instante UTC en que comienza el día local `iso`
    const guess = Date.parse(`${iso}T00:00:00Z`) / 1000;
    for (let off = -14 * 3600; off <= 14 * 3600; off += 900) {
      const t = guess + off;
      const local = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t * 1000));
      const prev = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date((t - 900) * 1000));
      if (local === iso && prev !== iso) return t;
    }
    return guess;
  };
  return [probe(date), probe(shiftDate(date, 1))];
}

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
