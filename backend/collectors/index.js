'use strict';
/**
 * Orquestador de recolección diaria:
 *   partidos del día → histórico de cada equipo → estadísticas → H2H → clasificaciones → cuotas
 *
 * El plan gratuito de API-Football permite 100 peticiones/día. Por eso el ciclo tiene un
 * presupuesto (`MAX_REQUESTS_PER_RUN`) y no repite datos que ya están en la base:
 *   - si el equipo tiene un partido reciente guardado, no se vuelve a pedir su histórico;
 *   - si ya hay H2H en la base, no se pide de nuevo;
 *   - las estadísticas tienen su propio tope (`MAX_STATS_PER_RUN`).
 * Al agotarse el presupuesto el ciclo termina con lo que tenga, en vez de fallar a medias.
 */
const config = require('../config');
const { createLogger } = require('../lib/logger');
const { collectFixtures } = require('./fixtures');
const { collectTeamHistory, collectStats, collectH2H, collectStandings } = require('./historical');

const log = createLogger('collector');

async function runDailyCollection(date, { provider, repos, onProgress = () => {}, options = {} }) {
  const runId = repos.startRun('collect', date);
  const startReq = provider.requestCount;
  const budget = options.maxRequests ?? config.collection.maxRequestsPerRun;
  const statsBudget = options.maxStats ?? config.collection.maxStatsPerRun;
  const maxAge = (options.teamHistoryMaxAgeDays ?? config.collection.teamHistoryMaxAgeDays) * 86400;
  const now = Math.floor(Date.now() / 1000);
  const spent = () => provider.requestCount - startReq;
  const canSpend = (n = 1) => !budget || spent() + n <= budget;
  const summary = { date, provider: provider.name, matches: 0, teams: 0, statsFetched: 0, h2h: 0, standings: 0, odds: 0, errors: [], budgetReached: false, mixedSources: false };
  let statsLeft = statsBudget;

  try {
    const collected = await collectFixtures(date, { provider, repos, ...options });
    const matches = collected.matches;
    summary.matches = matches.length || collected.existingCount || 0;
    summary.mixedSources = !!collected.mixedSources;
    const teamIds = [...new Set(matches.flatMap((m) => [m.home.id, m.away.id]))];
    const total = teamIds.length + matches.length;
    let done = 0;
    const tick = (label) => onProgress({ done: ++done, total, label });

    for (const teamId of teamIds) {
      try {
        const last = repos.teamHistory(teamId, now, 1)[0];
        const fresh = last && now - last.start_time <= maxAge;
        let finished;
        if (fresh || !canSpend()) {
          // Ya hay resultados recientes en la base: no gastamos cupo en repetirlos.
          finished = repos.teamHistory(teamId, now, options.historyDepth ?? config.collection.historyDepth);
        } else {
          finished = await collectTeamHistory(teamId, { provider, repos, depth: options.historyDepth });
        }
        if (statsLeft > 0) {
          const perTeam = Math.min(options.statsDepth ?? config.collection.statsDepth, statsLeft);
          const fetched = await collectStats(finished.slice(0, perTeam), { provider, repos });
          statsLeft -= fetched;
          summary.statsFetched += fetched;
        }
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
        const knownH2H = repos.h2hHistory(m.home.id, m.away.id, now, 5);
        if (knownH2H.length >= 3 || !canSpend()) {
          summary.h2h += knownH2H.length;
        } else {
          summary.h2h += await collectH2H(m, { provider, repos });
        }
        const key = `${m.tournament?.id}|${m.seasonId}`;
        if (m.tournament?.id && m.seasonId && !seenStandings.has(key) && canSpend()) {
          seenStandings.add(key);
          summary.standings += await collectStandings(m.tournament.id, m.seasonId, { provider, repos });
        }
        if (canSpend()) {
          const odds = await provider.getOdds(m.id);
          if (odds.length) { repos.saveOdds(m.id, odds); summary.odds += 1; }
        }
      } catch (err) {
        summary.errors.push({ matchId: m.id, error: err.message });
        log.warn('Fallo H2H/clasificación/cuotas', { matchId: m.id, err: err.message });
      }
      tick(`partido ${m.home.name} vs ${m.away.name}`);
    }
    summary.budgetReached = !canSpend();
    if (summary.budgetReached) log.warn('Presupuesto de peticiones agotado; el ciclo termina con los datos disponibles', { budget, requests: spent() });
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
