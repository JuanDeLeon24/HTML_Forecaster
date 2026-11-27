'use strict';
/** Descarga los partidos programados de una fecha y los guarda. */
const config = require('../config');
const { localDate } = require('../lib/dates');
const { createLogger } = require('../lib/logger');

const log = createLogger('collector:fixtures');

/**
 * @param {string} date YYYY-MM-DD (zona horaria config.timezone)
 * @returns {Promise<object[]>} partidos canónicos de esa fecha local tras aplicar filtros
 */
/** Competiciones permitidas para un partido según SU proveedor (cada fuente usa sus propios IDs). */
function allowedFor(providerName, tournaments) {
  if (tournaments) return tournaments;
  if (providerName === 'football-data') return config.footballData.competitions;
  if (providerName === 'api-football') return config.apiFootball.leagues;
  return config.collection.tournaments;
}

async function collectFixtures(date, { provider, repos, tournaments = null, maxMatches = config.collection.maxMatches }) {
  const all = await provider.getScheduledMatches(date);
  let matches = all.filter((m) => localDate(m.startTime) === date);
  matches = matches.filter((m) => {
    const list = allowedFor(m.provider, tournaments);
    if (!list.length) return true;
    return m.tournament && list.map(String).includes(String(m.tournament.id).split(':').pop());
  });
  matches.sort((a, b) => a.startTime - b.startTime);
  if (maxMatches > 0) matches = matches.slice(0, maxMatches);
  // Solo continúan los partidos que superan la validación
  matches = matches.filter((m) => repos.upsertMatch(m));
  log.info(`Partidos del ${date}: ${matches.length} (de ${all.length} recibidos)`);
  return matches;
}

module.exports = { collectFixtures, allowedFor };
