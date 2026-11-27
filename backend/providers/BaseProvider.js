'use strict';
/**
 * Contrato que debe cumplir cualquier fuente de datos (Sofascore, API-Football,
 * Football-Data, FBref...). El núcleo (analizadores, modelos, validación) solo
 * conoce estos objetos canónicos, por lo que añadir una fuente NO modifica el núcleo.
 *
 * Objeto canónico Match:
 * {
 *   id: 'proveedor:event:123', provider, providerRef?,
 *   tournament: { id, name, category } | null, seasonId?, round?,
 *   startTime: unixSeconds, status: 'notstarted'|'inprogress'|'finished'|'postponed'|'canceled'|'unknown',
 *   home: { id, name, shortName?, country? }, away: {...},
 *   homeGoals?, awayGoals?, homeGoalsHt?, awayGoalsHt?   // marcador a 90'
 * }
 *
 * Stats canónicas: { available: bool, homeCorners, awayCorners, homeYellow, awayYellow, homeRed, awayRed,
 *   homeShots, awayShots, homeSot, awaySot, homePossession, awayPossession, homeFouls, awayFouls, homeXg, awayXg }
 * Incidente: { type: 'goal'|'red_card'|'yellow_card'|'penalty_miss', minute, side: 'home'|'away', player, detail }
 * Fila de clasificación: { teamId, teamName, position, points, played, wins, draws, losses, goalsFor, goalsAgainst }
 * Cuota: { market: '1X2'|'DC'|'OU'|'BTTS', selection, line, decimalOdds, source }
 *
 * Todos los métodos deben devolver null / [] cuando el dato no existe: nunca valores inventados.
 */
class BaseProvider {
  get name() { throw new Error('not implemented'); }
  /** @returns {Promise<object[]>} partidos de la fecha (YYYY-MM-DD, puede incluir días vecinos) */
  async getScheduledMatches(_date) { throw new Error('not implemented'); }
  /** @returns {Promise<object[]>} últimos partidos (terminados o no) del equipo, recientes primero */
  async getTeamRecentMatches(_teamId, _limit) { throw new Error('not implemented'); }
  async getMatch(_matchId) { throw new Error('not implemented'); }
  async getMatchStats(_matchId) { return { available: false }; }
  async getMatchIncidents(_matchId) { return []; }
  async getH2H(_match) { return []; }
  async getStandings(_tournamentId, _seasonId) { return []; }
  async getOdds(_matchId) { return []; }
  async getLineups(_matchId) { return null; }
  /** Competiciones a seguir por defecto con este proveedor (sus propios IDs). */
  defaultCompetitions() { return []; }
  /** IDs de las temporadas más recientes de una competición (la actual primero). */
  async getRecentSeasons(_competitionId, _count) { return []; }
  /** Todos los partidos de una temporada de una competición (carga inicial del histórico). */
  async getSeasonMatches(_competitionId, _seasonId) { return []; }
  /** Número de peticiones realizadas (para logs / auditoría). */
  get requestCount() { return 0; }
}

module.exports = { BaseProvider };
