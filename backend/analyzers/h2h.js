'use strict';
/** Head to Head: enfrentamientos directos reales entre ambos equipos (cualquier sede). */
const { mean } = require('../lib/math');

function summarizeH2H(rows, homeTeamId, awayTeamId) {
  const games = rows.map((r) => {
    const total = r.home_goals + r.away_goals;
    const homeTeamGoals = r.home_team_id === homeTeamId ? r.home_goals : r.away_goals;
    const awayTeamGoals = r.home_team_id === homeTeamId ? r.away_goals : r.home_goals;
    const hasStats = r.stats_available === 1 && r.home_corners !== null;
    const hasCards = r.stats_available === 1 && r.home_yellow !== null;
    return {
      matchId: r.id, startTime: r.start_time, homeTeamAtHome: r.home_team_id === homeTeamId,
      score: `${r.home_goals}-${r.away_goals}`, homeTeamGoals, awayTeamGoals, total,
      corners: hasStats ? r.home_corners + r.away_corners : null,
      cards: hasCards ? r.home_yellow + r.away_yellow + (r.home_red ?? 0) + (r.away_red ?? 0) : null,
    };
  });
  const window = (n) => {
    const g = games.slice(0, n);
    const corners = g.filter((x) => x.corners !== null);
    const cards = g.filter((x) => x.cards !== null);
    const rate = (f) => (g.length ? g.filter(f).length / g.length : null);
    return {
      n: g.length,
      homeTeamWins: g.filter((x) => x.homeTeamGoals > x.awayTeamGoals).length,
      draws: g.filter((x) => x.homeTeamGoals === x.awayTeamGoals).length,
      awayTeamWins: g.filter((x) => x.homeTeamGoals < x.awayTeamGoals).length,
      avgGoals: mean(g.map((x) => x.total)),
      btts: rate((x) => x.homeTeamGoals > 0 && x.awayTeamGoals > 0),
      over15: rate((x) => x.total > 1.5),
      over25: rate((x) => x.total > 2.5),
      over35: rate((x) => x.total > 3.5),
      cornersN: corners.length,
      avgCorners: mean(corners.map((x) => x.corners)),
      over85Corners: corners.length ? corners.filter((x) => x.corners > 8.5).length / corners.length : null,
      cardsN: cards.length,
      avgCards: mean(cards.map((x) => x.cards)),
    };
  };
  return { ...window(10), last5: window(5), last10: window(10), last20: window(20), games: games.slice(0, 10), homeTeamId, awayTeamId };
}

module.exports = { summarizeH2H };
