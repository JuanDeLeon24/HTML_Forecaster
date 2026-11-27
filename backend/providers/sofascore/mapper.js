'use strict';
/**
 * Traduce las respuestas JSON de la API no oficial de Sofascore a objetos canónicos.
 * Separado del cliente para poder testearse sin red.
 */
const P = 'sofascore';

const ids = {
  event: (id) => `${P}:event:${id}`,
  team: (id) => `${P}:team:${id}`,
  tournament: (id) => `${P}:ut:${id}`,
  season: (id) => `${P}:season:${id}`,
  native: (canonical) => String(canonical).split(':').pop(),
};

const STATUS = { notstarted: 'notstarted', inprogress: 'inprogress', finished: 'finished', postponed: 'postponed', canceled: 'canceled', cancelled: 'canceled' };

function mapTeam(t) {
  return { id: ids.team(t.id), name: t.name, shortName: t.shortName ?? null, country: t.country?.name ?? null };
}

/** Marcador a 90': Sofascore expone `normaltime` cuando hubo prórroga/penales. */
function regulationScore(score) {
  if (!score) return null;
  if (Number.isFinite(score.normaltime)) return score.normaltime;
  if (Number.isFinite(score.current)) return score.current;
  return null;
}

function mapEvent(e) {
  const ut = e.tournament?.uniqueTournament;
  const status = STATUS[e.status?.type] ?? 'unknown';
  const finished = status === 'finished';
  return {
    id: ids.event(e.id),
    provider: P,
    providerRef: e.customId ?? null,
    tournament: ut ? { id: ids.tournament(ut.id), name: ut.name ?? e.tournament?.name, category: e.tournament?.category?.name ?? null }
      : (e.tournament ? { id: `${P}:t:${e.tournament.id}`, name: e.tournament.name, category: e.tournament.category?.name ?? null } : null),
    seasonId: e.season?.id ? ids.season(e.season.id) : null,
    round: e.roundInfo?.round != null ? String(e.roundInfo.round) : null,
    startTime: e.startTimestamp,
    status,
    home: mapTeam(e.homeTeam),
    away: mapTeam(e.awayTeam),
    homeGoals: finished ? regulationScore(e.homeScore) : null,
    awayGoals: finished ? regulationScore(e.awayScore) : null,
    homeGoalsHt: finished && Number.isFinite(e.homeScore?.period1) ? e.homeScore.period1 : null,
    awayGoalsHt: finished && Number.isFinite(e.awayScore?.period1) ? e.awayScore.period1 : null,
    referee: e.referee?.name ?? null,
  };
}

const STAT_KEYS = {
  cornerKicks: 'Corners', yellowCards: 'Yellow', redCards: 'Red', totalShotsOnGoal: 'Shots',
  shotsOnGoal: 'Sot', ballPossession: 'Possession', fouls: 'Fouls', expectedGoals: 'Xg',
};
const STAT_NAMES = {
  'corner kicks': 'Corners', 'yellow cards': 'Yellow', 'red cards': 'Red', 'total shots': 'Shots',
  'shots on target': 'Sot', 'ball possession': 'Possession', fouls: 'Fouls', 'expected goals': 'Xg',
};

function num(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

function mapStatistics(json) {
  const all = json?.statistics?.find((s) => s.period === 'ALL');
  if (!all) return { available: false };
  const out = { available: true };
  for (const g of all.groups ?? []) {
    for (const it of g.statisticsItems ?? []) {
      const k = STAT_KEYS[it.key] ?? STAT_NAMES[String(it.name ?? '').toLowerCase()];
      if (!k || out[`home${k}`] !== undefined) continue;
      out[`home${k}`] = num(it.homeValue ?? it.home);
      out[`away${k}`] = num(it.awayValue ?? it.away);
    }
  }
  // Sofascore omite "Red cards" cuando no hubo expulsiones: en ese caso son 0, no desconocido
  if (out.homeYellow !== undefined && out.homeRed === undefined) { out.homeRed = 0; out.awayRed = 0; }
  if (out.homeCorners === undefined && out.homeYellow === undefined) out.available = false;
  return out;
}

function mapIncidents(json) {
  const out = [];
  for (const i of json?.incidents ?? []) {
    const side = i.isHome === true ? 'home' : i.isHome === false ? 'away' : null;
    const minute = Number.isFinite(i.time) ? i.time : null;
    if (i.incidentType === 'goal') out.push({ type: 'goal', minute, side, player: i.player?.name ?? null, detail: i.incidentClass ?? null });
    else if (i.incidentType === 'card') {
      const red = i.incidentClass === 'red' || i.incidentClass === 'yellowRed';
      out.push({ type: red ? 'red_card' : 'yellow_card', minute, side, player: i.player?.name ?? i.playerName ?? null, detail: i.incidentClass ?? null });
    } else if (i.incidentType === 'inGamePenalty' && i.incidentClass !== 'scored') {
      out.push({ type: 'penalty_miss', minute, side, player: i.player?.name ?? null, detail: i.incidentClass ?? null });
    }
  }
  return out;
}

function mapStandings(json) {
  const table = json?.standings?.[0];
  return (table?.rows ?? []).map((r) => ({
    teamId: ids.team(r.team.id), teamName: r.team.name, position: r.position, points: r.points, played: r.matches,
    wins: r.wins, draws: r.draws, losses: r.losses, goalsFor: r.scoresFor, goalsAgainst: r.scoresAgainst,
  }));
}

function fractionalToDecimal(f) {
  if (!f) return null;
  const [a, b] = String(f).split('/').map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return Math.round((a / b + 1) * 1000) / 1000;
}

function mapOdds(json) {
  const out = [];
  for (const m of json?.markets ?? []) {
    const name = String(m.marketName ?? '').toLowerCase();
    for (const c of m.choices ?? []) {
      const d = fractionalToDecimal(c.fractionalValue);
      if (!d || d <= 1) continue;
      const sel = String(c.name).toLowerCase();
      if (name === 'full time') out.push({ market: '1X2', selection: String(c.name).toUpperCase(), line: 0, decimalOdds: d, source: 'sofascore' });
      else if (name === 'double chance') out.push({ market: 'DC', selection: String(c.name).toUpperCase(), line: 0, decimalOdds: d, source: 'sofascore' });
      else if (name === 'both teams to score') out.push({ market: 'BTTS', selection: sel === 'yes' ? 'yes' : 'no', line: 0, decimalOdds: d, source: 'sofascore' });
      else if (name === 'match goals' && m.choiceGroup) out.push({ market: 'OU', selection: sel.startsWith('over') ? 'over' : 'under', line: parseFloat(m.choiceGroup), decimalOdds: d, source: 'sofascore' });
    }
  }
  return out.filter((o) => o.market !== '1X2' || ['1', 'X', '2'].includes(o.selection));
}

function mapLineups(json) {
  const out = { home: [], away: [] };
  for (const side of ['home', 'away']) {
    for (const p of json?.[side]?.players ?? []) {
      out[side].push({ player: p.player?.name ?? null, position: p.position ?? null, isStarter: !!p.substitute === false });
    }
  }
  return out;
}

module.exports = { ids, mapEvent, mapStatistics, mapIncidents, mapStandings, mapOdds, mapLineups, fractionalToDecimal };
