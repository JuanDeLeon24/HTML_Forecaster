'use strict';
/** Histórico por equipo, estadísticas por partido, H2H y clasificaciones. */
const config = require('../config');
const { createLogger } = require('../lib/logger');

const log = createLogger('collector:historical');

/** Guarda los últimos `depth` partidos del equipo y devuelve los terminados (recientes primero). */
async function collectTeamHistory(teamId, { provider, repos, depth = config.collection.historyDepth }) {
  const recent = await provider.getTeamRecentMatches(teamId, depth);
  const finished = recent.filter((m) => m.status === 'finished' && m.homeGoals !== null).slice(0, depth);
  for (const m of recent) repos.upsertMatch(m);
  return finished;
}

/** Descarga estadísticas de partidos terminados que aún no estén en la base (cache permanente). */
async function collectStats(matches, { provider, repos }) {
  let fetched = 0;
  for (const m of matches) {
    if (m.status !== 'finished' || repos.hasStats(m.id)) continue;
    try {
      const stats = await provider.getMatchStats(m.id);
      repos.saveStats(m.id, stats);
      fetched += 1;
    } catch (err) {
      log.warn('No se pudieron obtener estadísticas', { match: m.id, err: err.message });
    }
  }
  return fetched;
}

async function collectH2H(match, { provider, repos, statsDepth = config.collection.h2hStatsDepth }) {
  const h2h = (await provider.getH2H(match)).filter((m) => m.status === 'finished' && m.homeGoals !== null);
  h2h.sort((a, b) => b.startTime - a.startTime);
  for (const m of h2h) repos.upsertMatch(m);
  repos.linkH2H(match.id, h2h.map((m) => m.id));
  await collectStats(h2h.slice(0, statsDepth), { provider, repos });
  return h2h.length;
}

async function collectStandings(tournamentId, seasonId, { provider, repos }) {
  const rows = await provider.getStandings(tournamentId, seasonId);
  if (rows.length) repos.saveStandings(tournamentId, seasonId, rows);
  return rows.length;
}

module.exports = { collectTeamHistory, collectStats, collectH2H, collectStandings };
