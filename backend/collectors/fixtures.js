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
async function collectFixtures(date, { provider, repos, tournaments = config.collection.tournaments, maxMatches = config.collection.maxMatches }) {
  const all = await provider.getScheduledMatches(date);
  let matches = all.filter((m) => localDate(m.startTime) === date);
  if (tournaments.length) {
    const allowed = new Set(tournaments.map(String));
    matches = matches.filter((m) => m.tournament && allowed.has(String(m.tournament.id).split(':').pop()));
  }
  matches.sort((a, b) => a.startTime - b.startTime);
  if (maxMatches > 0) matches = matches.slice(0, maxMatches);
  // Solo continúan los partidos que superan la validación
  matches = matches.filter((m) => repos.upsertMatch(m));
  log.info(`Partidos del ${date}: ${matches.length} (de ${all.length} recibidos)`);
  return matches;
}

module.exports = { collectFixtures };
