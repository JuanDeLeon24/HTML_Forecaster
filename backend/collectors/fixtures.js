'use strict';
/** Descarga los partidos programados de una fecha y los guarda. */
const config = require('../config');
const { localDate, dayRange } = require('../lib/dates');
const { createLogger } = require('../lib/logger');

const log = createLogger('collector:fixtures');

/**
 * @param {string} date YYYY-MM-DD (zona horaria config.timezone)
 * @returns {Promise<{matches: object[], existingCount: number, mixedSources: boolean}>}
 *   partidos canónicos de esa fecha tras aplicar filtros. Si la fecha ya tiene partidos
 *   de OTRO proveedor, no se añaden los nuevos (evita duplicados y equipos mezclados).
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

  // Una fecha se alimenta de una sola fuente. Si ya hay partidos de otro proveedor,
  // se conservan (con sus pronósticos) y no se insertan duplicados con otros IDs.
  const [from, to] = dayRange(date);
  const existing = repos.matchesBetween(from, to);
  const incomingProvider = matches[0]?.provider;
  if (existing.length && incomingProvider && !existing.some((m) => m.provider === incomingProvider)) {
    log.info(`El ${date} ya tiene ${existing.length} partidos de ${existing[0].provider}; no se mezclan fuentes`, { incomingProvider });
    return { matches: [], existingCount: existing.length, mixedSources: true };
  }

  // Solo continúan los partidos que superan la validación
  matches = matches.filter((m) => repos.upsertMatch(m));
  log.info(`Partidos del ${date}: ${matches.length} (de ${all.length} recibidos)`);
  return { matches, existingCount: existing.length, mixedSources: false };
}

module.exports = { collectFixtures, allowedFor };
