'use strict';
/**
 * Carga inicial del histórico: descarga temporadas COMPLETAS de cada competición seguida
 * (actual + anteriores) en pocas peticiones, para que cada equipo tenga decenas de partidos
 * reales desde el primer día (con 5 partidos por equipo cualquier probabilidad es ruido).
 * Solo guarda partidos reales que superan la validación; no descarga estadísticas por partido
 * (eso lo hace la recolección diaria) para no agotar los límites de las APIs.
 */
const config = require('../config');
const { createLogger } = require('../lib/logger');

const log = createLogger('collector:bootstrap');

async function runBootstrap({ provider, repos, competitions = null, seasons = config.collection.bootstrapSeasons, onProgress = () => {} }) {
  const runId = repos.startRun('bootstrap');
  const startReq = provider.requestCount;
  const comps = (competitions && competitions.length ? competitions : provider.defaultCompetitions()) || [];
  const summary = { competitions: comps.length, seasons: 0, matches: 0, saved: 0, rejected: 0, errors: [] };
  if (!comps.length) {
    const msg = 'No hay competiciones configuradas para este proveedor (TOURNAMENTS / FOOTBALL_DATA_COMPETITIONS / API_FOOTBALL_LEAGUES).';
    repos.finishRun(runId, 'error', { summary, error: msg });
    throw new Error(msg);
  }
  const base = provider.providers ? provider.providers[0] : provider;
  const prefix = { 'football-data': 'football-data:comp:', 'api-football': 'api-football:comp:' }[base.name] ?? 'sofascore:ut:';
  let done = 0;
  for (const comp of comps) {
    const compId = String(comp).includes(':') ? String(comp) : `${prefix}${comp}`;
    try {
      const list = await provider.getRecentSeasons(compId, seasons);
      for (const season of list) {
        onProgress({ done, total: comps.length, label: `competición ${comp} · temporada ${season.name}` });
        const matches = await provider.getSeasonMatches(compId, season.id);
        summary.seasons += 1;
        summary.matches += matches.length;
        const save = () => {
          for (const m of matches) {
            if (repos.upsertMatch(m)) summary.saved += 1; else summary.rejected += 1;
          }
        };
        if (repos.tx) repos.tx(save); else save();
      }
    } catch (err) {
      summary.errors.push({ competition: comp, error: err.message });
      log.warn('Fallo cargando histórico de competición', { competition: comp, error: err.message });
    }
    done += 1;
    onProgress({ done, total: comps.length, label: `competición ${comp}` });
  }
  const requests = provider.requestCount - startReq;
  repos.finishRun(runId, summary.errors.length === comps.length ? 'error' : 'ok', { requests, summary });
  log.info('Histórico cargado', { ...summary, errors: summary.errors.length, requests });
  return { ...summary, requests };
}

module.exports = { runBootstrap };
