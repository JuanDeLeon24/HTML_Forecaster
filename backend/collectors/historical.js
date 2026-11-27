'use strict';
/** Histórico por equipo, estadísticas por partido, H2H y clasificaciones. */
const config = require('../config');
const { createLogger } = require('../lib/logger');

const log = createLogger('collector:historical');

/** Guarda los últimos `depth` partidos del equipo y devuelve los terminados (recientes primero). */
async function collectTeamHistory(teamId, { provider, repos, depth = config.collection.historyDepth }) {
  const recent = await provider.getTeamRecentMatches(teamId, depth);
  const saved = recent.filter((m) => repos.upsertMatch(m));
  return saved.filter((m) => m.status === 'finished' && m.homeGoals !== null).slice(0, depth);
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
  const saved = h2h.filter((m) => repos.upsertMatch(m));
  repos.linkH2H(match.id, saved.map((m) => m.id));
  await collectStats(saved.slice(0, statsDepth), { provider, repos });
  return saved.length;
}

async function collectStandings(tournamentId, seasonId, { provider, repos }) {
  const rows = await provider.getStandings(tournamentId, seasonId);
  if (rows.length) repos.saveStandings(tournamentId, seasonId, rows);
  return rows.length;
}

module.exports = { collectTeamHistory, collectStats, collectH2H, collectStandings };
