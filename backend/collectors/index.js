'use strict';
/**
 * Orquestador de recolección diaria:
 *   partidos del día → histórico de cada equipo → estadísticas → H2H → clasificaciones → cuotas
 */
const config = require('../config');
const { createLogger } = require('../lib/logger');
const { collectFixtures } = require('./fixtures');
const { collectTeamHistory, collectStats, collectH2H, collectStandings } = require('./historical');

const log = createLogger('collector');

async function runDailyCollection(date, { provider, repos, onProgress = () => {}, options = {} }) {
  const runId = repos.startRun('collect', date);
  const startReq = provider.requestCount;
  const summary = { date, matches: 0, teams: 0, statsFetched: 0, h2h: 0, standings: 0, odds: 0, errors: [] };
  try {
    const matches = await collectFixtures(date, { provider, repos, ...options });
    summary.matches = matches.length;
    const teamIds = [...new Set(matches.flatMap((m) => [m.home.id, m.away.id]))];
    const total = teamIds.length + matches.length;
    let done = 0;
    const tick = (label) => onProgress({ done: ++done, total, label });

    for (const teamId of teamIds) {
      try {
        const finished = await collectTeamHistory(teamId, { provider, repos, depth: options.historyDepth });
        summary.statsFetched += await collectStats(finished.slice(0, options.statsDepth ?? config.collection.statsDepth), { provider, repos });
        summary.teams += 1;
      } catch (err) {
        summary.errors.push({ teamId, error: err.message });
        log.warn('Fallo histórico de equipo', { teamId, err: err.message });
      }
      tick(`equipo ${teamId}`);
    }

    const seenStandings = new Set();
    for (const m of matches) {
      try {
        summary.h2h += await collectH2H(m, { provider, repos });
        const key = `${m.tournament?.id}|${m.seasonId}`;
        if (m.tournament?.id && m.seasonId && !seenStandings.has(key)) {
          seenStandings.add(key);
          summary.standings += await collectStandings(m.tournament.id, m.seasonId, { provider, repos });
        }
        const odds = await provider.getOdds(m.id);
        if (odds.length) { repos.saveOdds(m.id, odds); summary.odds += 1; }
      } catch (err) {
        summary.errors.push({ matchId: m.id, error: err.message });
        log.warn('Fallo H2H/clasificación/cuotas', { matchId: m.id, err: err.message });
      }
      tick(`partido ${m.home.name} vs ${m.away.name}`);
    }
    const requests = provider.requestCount - startReq;
    repos.finishRun(runId, 'ok', { requests, summary });
    log.info('Recolección completada', { ...summary, errors: summary.errors.length, requests });
    return summary;
  } catch (err) {
    repos.finishRun(runId, 'error', { requests: provider.requestCount - startReq, summary, error: err.message });
    throw err;
  }
}

module.exports = { runDailyCollection };
