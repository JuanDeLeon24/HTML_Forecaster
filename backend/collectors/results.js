'use strict';
/** Actualiza el resultado real de un partido (marcador, estadísticas, incidencias). */
async function refreshMatchResult(matchId, { provider, repos }) {
  const m = await provider.getMatch(matchId);
  if (!m) return null;
  if (!repos.upsertMatch(m)) return null;
  if (m.status === 'finished') {
    repos.saveStats(m.id, await provider.getMatchStats(m.id));
    repos.saveIncidents(m.id, await provider.getMatchIncidents(m.id));
  }
  return m;
}

module.exports = { refreshMatchResult };
