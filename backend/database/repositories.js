'use strict';
/**
 * Repositorios: TODO el SQL de la aplicación. El resto del código trabaja con
 * objetos canónicos independientes del proveedor de datos.
 */
const { nowSec } = require('../lib/dates');
const { validateMatch, sanitizeStats, validateOdds } = require('../validators');
const { recordError } = require('../lib/logger');
const { migrate } = require('./migrations');

const STAT_COLS = ['corners', 'yellow', 'red', 'shots', 'sot', 'possession', 'fouls', 'xg'];

function createRepositories(db) {
  migrate(db);
  // ---------------------------------------------------------------- escritura
  function upsertTeam(t) {
    db.run(`INSERT INTO teams(id, provider, name, short_name, country, updated_at)
            VALUES(?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, short_name=excluded.short_name,
              country=COALESCE(excluded.country, teams.country), updated_at=excluded.updated_at`,
    t.id, t.provider, t.name, t.shortName ?? null, t.country ?? null, nowSec());
  }

  function upsertTournament(t) {
    if (!t?.id) return;
    db.run(`INSERT INTO tournaments(id, provider, name, category, updated_at) VALUES(?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, updated_at=excluded.updated_at`,
    t.id, t.provider, t.name, t.category ?? null, nowSec());
  }

  /** Guarda un partido SOLO si supera la validación; si no, lo registra en errors.log y devuelve false. */
  function upsertMatch(m) {
    const errors = validateMatch(m);
    if (errors.length) {
      recordError({ source: m?.provider ?? 'desconocido', endpoint: m?.id ?? null, error: `partido rechazado: ${errors.join('; ')}`, impact: 'el partido no se guarda ni se usa en el análisis' });
      return false;
    }
    upsertTeam({ ...m.home, provider: m.provider });
    upsertTeam({ ...m.away, provider: m.provider });
    if (m.tournament) upsertTournament({ ...m.tournament, provider: m.provider });
    db.run(`INSERT INTO matches(id, provider, provider_ref, tournament_id, tournament_name, season_id, round, start_time,
              status, home_team_id, away_team_id, home_goals, away_goals, home_goals_ht, away_goals_ht, updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET provider_ref=COALESCE(excluded.provider_ref, matches.provider_ref),
              tournament_id=excluded.tournament_id, tournament_name=excluded.tournament_name,
              season_id=excluded.season_id, round=excluded.round, start_time=excluded.start_time,
              status=excluded.status, home_goals=excluded.home_goals, away_goals=excluded.away_goals,
              home_goals_ht=excluded.home_goals_ht, away_goals_ht=excluded.away_goals_ht, updated_at=excluded.updated_at`,
    m.id, m.provider, m.providerRef ?? null, m.tournament?.id ?? null, m.tournament?.name ?? null,
    m.seasonId ?? null, m.round ?? null, m.startTime, m.status, m.home.id, m.away.id,
    m.homeGoals ?? null, m.awayGoals ?? null, m.homeGoalsHt ?? null, m.awayGoalsHt ?? null, nowSec());
    return true;
  }

  function saveStats(matchId, raw, ctx = {}) {
    const s = sanitizeStats(raw, { source: ctx.source, endpoint: ctx.endpoint ?? `${matchId}/statistics` });
    const cols = [];
    const vals = [];
    for (const c of STAT_COLS) {
      const k = c[0].toUpperCase() + c.slice(1);
      cols.push(`home_${c}`, `away_${c}`);
      vals.push(s?.[`home${k}`] ?? null, s?.[`away${k}`] ?? null);
    }
    db.run(`INSERT OR REPLACE INTO match_stats(match_id, available, ${cols.join(',')}, fetched_at)
            VALUES(?,?,${cols.map(() => '?').join(',')},?)`,
    matchId, s?.available ? 1 : 0, ...vals, nowSec());
  }

  function saveIncidents(matchId, incidents) {
    db.run('DELETE FROM match_incidents WHERE match_id=?', matchId);
    for (const i of incidents) {
      db.run('INSERT INTO match_incidents(match_id,type,minute,side,player,detail) VALUES(?,?,?,?,?,?)',
        matchId, i.type, i.minute ?? null, i.side ?? null, i.player ?? null, i.detail ?? null);
    }
  }

  function linkH2H(matchId, h2hIds) {
    for (const id of h2hIds) db.run('INSERT OR IGNORE INTO h2h_links(match_id,h2h_match_id) VALUES(?,?)', matchId, id);
  }

  function saveStandings(tournamentId, seasonId, rows) {
    for (const r of rows) {
      db.run(`INSERT OR REPLACE INTO standings(tournament_id,season_id,team_id,position,points,played,wins,draws,losses,
                goals_for,goals_against,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      tournamentId, seasonId, r.teamId, r.position, r.points, r.played, r.wins, r.draws, r.losses,
      r.goalsFor, r.goalsAgainst, nowSec());
    }
  }

  function saveOdds(matchId, odds) {
    for (const o of odds) {
      const errs = validateOdds(o);
      if (errs.length) { recordError({ source: o.source ?? 'odds', endpoint: `${matchId}/odds`, error: errs.join('; '), impact: 'cuota descartada' }); continue; }
      db.run(`INSERT OR REPLACE INTO odds(match_id,market,selection,line,decimal_odds,source,fetched_at)
              VALUES(?,?,?,?,?,?,?)`, matchId, o.market, o.selection, o.line ?? 0, o.decimalOdds, o.source ?? null, nowSec());
    }
  }

  // ---------------------------------------------------------------- lectura
  const MATCH_SELECT = `SELECT m.*, ht.name AS home_name, ht.short_name AS home_short, at.name AS away_name,
      at.short_name AS away_short, t.category AS tournament_category
    FROM matches m JOIN teams ht ON ht.id=m.home_team_id JOIN teams at ON at.id=m.away_team_id
    LEFT JOIN tournaments t ON t.id=m.tournament_id`;

  function getMatch(id) { return db.get(`${MATCH_SELECT} WHERE m.id=?`, id); }

  function matchesBetween(fromSec, toSec) {
    return db.all(`${MATCH_SELECT} WHERE m.start_time >= ? AND m.start_time < ? ORDER BY m.start_time`, fromSec, toSec);
  }

  /** Últimos partidos terminados de un equipo antes de `beforeSec`, con estadísticas si existen. */
  function teamHistory(teamId, beforeSec, limit) {
    return db.all(`SELECT m.*, s.available AS stats_available,
        s.home_corners, s.away_corners, s.home_yellow, s.away_yellow, s.home_red, s.away_red,
        s.home_shots, s.away_shots, s.home_sot, s.away_sot, s.home_xg, s.away_xg, s.home_fouls, s.away_fouls,
        s.home_possession, s.away_possession
      FROM matches m LEFT JOIN match_stats s ON s.match_id=m.id
      WHERE (m.home_team_id=? OR m.away_team_id=?) AND m.status='finished' AND m.start_time < ?
        AND m.home_goals IS NOT NULL
      ORDER BY m.start_time DESC LIMIT ?`, teamId, teamId, beforeSec, limit);
  }

  function h2hHistory(homeId, awayId, beforeSec, limit = 20) {
    return db.all(`SELECT m.*, s.available AS stats_available, s.home_corners, s.away_corners,
        s.home_yellow, s.away_yellow, s.home_red, s.away_red
      FROM matches m LEFT JOIN match_stats s ON s.match_id=m.id
      WHERE ((m.home_team_id=? AND m.away_team_id=?) OR (m.home_team_id=? AND m.away_team_id=?))
        AND m.status='finished' AND m.start_time < ? AND m.home_goals IS NOT NULL
      ORDER BY m.start_time DESC LIMIT ?`, homeId, awayId, awayId, homeId, beforeSec, limit);
  }

  function hasStats(matchId) { return !!db.get('SELECT 1 AS x FROM match_stats WHERE match_id=?', matchId); }

  function allFinishedMatches(beforeSec = 2 ** 31) {
    return db.all(`SELECT id, tournament_id, start_time, home_team_id, away_team_id, home_goals, away_goals
      FROM matches WHERE status='finished' AND home_goals IS NOT NULL AND start_time < ? ORDER BY start_time`, beforeSec);
  }

  /** Medias de goles del "pool" (torneo si hay muestra; si no, global) para normalizar fuerzas. */
  function goalBaseline(tournamentId, beforeSec, minSample = 40) {
    const since = beforeSec - 400 * 86400;
    const q = `SELECT COUNT(*) AS n, AVG(home_goals) AS home, AVG(away_goals) AS away,
        AVG(CASE WHEN home_goals=away_goals THEN 1.0 ELSE 0 END) AS draw_rate
      FROM matches WHERE status='finished' AND home_goals IS NOT NULL AND start_time < ? AND start_time >= ?`;
    if (tournamentId) {
      const r = db.get(`${q} AND tournament_id=?`, beforeSec, since, tournamentId);
      if (r && r.n >= minSample) return { ...r, scope: 'tournament' };
    }
    const g = db.get(q, beforeSec, since);
    return { ...g, scope: 'global' };
  }

  /** xG medio por equipo y partido del pool (para normalizar el modelo xG). */
  function xgBaseline(tournamentId, beforeSec, minSample = 30) {
    const since = beforeSec - 400 * 86400;
    const q = `SELECT COUNT(*) AS n, AVG(s.home_xg) AS home, AVG(s.away_xg) AS away FROM match_stats s JOIN matches m ON m.id=s.match_id
      WHERE s.home_xg IS NOT NULL AND s.away_xg IS NOT NULL AND m.status='finished' AND m.start_time < ? AND m.start_time >= ?`;
    if (tournamentId) {
      const r = db.get(`${q} AND m.tournament_id=?`, beforeSec, since, tournamentId);
      if (r && r.n >= minSample) return { ...r, scope: 'tournament' };
    }
    return { ...db.get(q, beforeSec, since), scope: 'global' };
  }

  function standingFor(tournamentId, seasonId, teamId) {
    return db.get('SELECT * FROM standings WHERE tournament_id=? AND season_id=? AND team_id=?', tournamentId, seasonId, teamId);
  }

  function oddsFor(matchId) { return db.all('SELECT * FROM odds WHERE match_id=?', matchId); }

  function incidentsFor(matchId) { return db.all('SELECT * FROM match_incidents WHERE match_id=? ORDER BY minute', matchId); }

  function statsFor(matchId) { return db.get('SELECT * FROM match_stats WHERE match_id=?', matchId); }

  // ---------------------------------------------------------------- pronósticos
  function saveForecast(f, predictions) {
    return db.tx(() => {
      db.run('UPDATE forecasts SET is_latest=0 WHERE match_id=?', f.matchId);
      // Las predicciones pendientes de pronósticos anteriores se anulan: solo cuenta la última versión antes del partido
      db.run(`UPDATE predictions SET void=1 WHERE match_id=? AND outcome IS NULL`, f.matchId);
      const r = db.run(`INSERT INTO forecasts(match_id, created_at, model_version, params_json, inputs_json, output_json, quality_json)
                        VALUES(?,?,?,?,?,?,?)`, f.matchId, nowSec(), f.modelVersion, JSON.stringify(f.params),
      JSON.stringify(f.inputs), JSON.stringify(f.output), JSON.stringify(f.quality));
      const forecastId = Number(r.lastInsertRowid);
      for (const p of predictions) {
        db.run(`INSERT INTO predictions(forecast_id, match_id, market, selection, line, probability, raw_probability, calibrated, confidence_score,
                  components_json, odds, is_pick, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, forecastId, f.matchId, p.market, p.selection, p.line ?? 0,
        p.probability, p.rawProbability ?? p.probability, p.calibrated ? 1 : 0, p.confidence ?? null,
        p.components ? JSON.stringify(p.components) : null, p.odds ?? null, p.isPick ? 1 : 0, nowSec());
      }
      if (f.modelPredictions) saveModelPredictions(forecastId, f.matchId, f.modelPredictions);
      if (f.valueBets) saveValueBets(forecastId, f.matchId, f.valueBets);
      return forecastId;
    });
  }

  function latestForecast(matchId) {
    const r = db.get('SELECT * FROM forecasts WHERE match_id=? AND is_latest=1', matchId);
    return r ? parseForecast(r) : null;
  }

  function forecastsBetween(fromSec, toSec) {
    return db.all(`SELECT f.* FROM forecasts f JOIN matches m ON m.id=f.match_id
      WHERE f.is_latest=1 AND m.start_time >= ? AND m.start_time < ? ORDER BY m.start_time`, fromSec, toSec).map(parseForecast);
  }

  function parseForecast(r) {
    return {
      id: r.id, matchId: r.match_id, createdAt: r.created_at, modelVersion: r.model_version,
      params: JSON.parse(r.params_json), inputs: JSON.parse(r.inputs_json), output: JSON.parse(r.output_json),
      quality: JSON.parse(r.quality_json), postAnalysis: r.post_analysis_json ? JSON.parse(r.post_analysis_json) : null,
    };
  }

  function predictionsForForecast(forecastId) {
    return db.all('SELECT * FROM predictions WHERE forecast_id=? ORDER BY id', forecastId);
  }

  function openPredictionMatches(beforeSec) {
    return db.all(`SELECT DISTINCT m.id, m.start_time, m.status FROM predictions p JOIN matches m ON m.id=p.match_id
      WHERE p.outcome IS NULL AND p.void=0 AND m.start_time < ? ORDER BY m.start_time`, beforeSec);
  }

  function openPredictionsFor(matchId) {
    return db.all('SELECT * FROM predictions WHERE match_id=? AND outcome IS NULL AND void=0', matchId);
  }

  function settlePrediction(id, outcome) {
    if (outcome === null) db.run('UPDATE predictions SET void=1, settled_at=? WHERE id=?', nowSec(), id);
    else db.run('UPDATE predictions SET outcome=?, settled_at=? WHERE id=?', outcome, nowSec(), id);
  }

  function setPostAnalysis(forecastId, analysis) {
    db.run('UPDATE forecasts SET post_analysis_json=? WHERE id=?', JSON.stringify(analysis), forecastId);
  }

  /** Predicciones liquidadas con filtros opcionales (para métricas e historial). */
  function settledPredictions({ from, to, market, tournamentId, teamId, onlyPicks, limit } = {}) {
    const where = ['p.outcome IS NOT NULL', 'p.void=0'];
    const args = [];
    if (from) { where.push('m.start_time >= ?'); args.push(from); }
    if (to) { where.push('m.start_time < ?'); args.push(to); }
    if (market) { where.push('p.market = ?'); args.push(market); }
    if (tournamentId) { where.push('m.tournament_id = ?'); args.push(tournamentId); }
    if (teamId) { where.push('(m.home_team_id = ? OR m.away_team_id = ?)'); args.push(teamId, teamId); }
    if (onlyPicks) where.push('p.is_pick = 1');
    return db.all(`SELECT p.*, m.start_time, m.tournament_name FROM predictions p JOIN matches m ON m.id=p.match_id
      WHERE ${where.join(' AND ')} ORDER BY m.start_time DESC ${limit ? 'LIMIT ' + Number(limit) : ''}`, ...args);
  }

  /** Historial: pronósticos (última versión) con su pick principal y estado. */
  function history({ from, to, tournamentId, teamId, limit = 500 } = {}) {
    const where = ['f.is_latest=1'];
    const args = [];
    if (from) { where.push('m.start_time >= ?'); args.push(from); }
    if (to) { where.push('m.start_time < ?'); args.push(to); }
    if (tournamentId) { where.push('m.tournament_id = ?'); args.push(tournamentId); }
    if (teamId) { where.push('(m.home_team_id = ? OR m.away_team_id = ?)'); args.push(teamId, teamId); }
    return db.all(`SELECT f.id AS forecast_id, f.created_at, f.model_version, f.post_analysis_json, m.id AS match_id, m.start_time,
        m.status, m.tournament_id, m.tournament_name, m.home_goals, m.away_goals, ht.name AS home_name, at.name AS away_name,
        (SELECT COUNT(*) FROM predictions p WHERE p.forecast_id=f.id AND p.outcome IS NOT NULL AND p.void=0) AS settled,
        (SELECT SUM(p.outcome) FROM predictions p WHERE p.forecast_id=f.id AND p.outcome IS NOT NULL AND p.void=0
            AND p.probability >= 0.5) AS hits_hp,
        (SELECT COUNT(*) FROM predictions p WHERE p.forecast_id=f.id AND p.outcome IS NOT NULL AND p.void=0
            AND p.probability >= 0.5) AS total_hp
      FROM forecasts f JOIN matches m ON m.id=f.match_id JOIN teams ht ON ht.id=m.home_team_id JOIN teams at ON at.id=m.away_team_id
      WHERE ${where.join(' AND ')} ORDER BY m.start_time DESC LIMIT ?`, ...args, limit);
  }

  /** λ de cada pronóstico (última versión) cuyo partido terminó: para ajustar ρ de Dixon-Coles. */
  function settledLambdas() {
    return db.all(`SELECT f.output_json, m.home_goals, m.away_goals FROM forecasts f JOIN matches m ON m.id=f.match_id
      WHERE f.is_latest=1 AND m.status='finished' AND m.home_goals IS NOT NULL`)
      .map((r) => ({ o: JSON.parse(r.output_json), homeGoals: r.home_goals, awayGoals: r.away_goals }))
      .filter((r) => r.o.status === 'ok' && r.o.lambdas)
      .map((r) => ({ lambdaHome: r.o.lambdas.home, lambdaAway: r.o.lambdas.away, homeGoals: r.homeGoals, awayGoals: r.awayGoals }));
  }

  /** Pronósticos (última versión) de partidos terminados con su resultado 1X2: para entrenar ML. */
  function settledForecastOutputs() {
    return db.all(`SELECT f.output_json, m.home_goals, m.away_goals, m.start_time FROM forecasts f JOIN matches m ON m.id=f.match_id
      WHERE f.is_latest=1 AND m.status='finished' AND m.home_goals IS NOT NULL ORDER BY m.start_time`)
      .map((r) => ({ output: JSON.parse(r.output_json), t: r.start_time, result: r.home_goals > r.away_goals ? '1' : r.home_goals === r.away_goals ? 'X' : '2' }))
      .filter((r) => r.output.status === 'ok');
  }

  function saveModelPredictions(forecastId, matchId, rows) {
    for (const r of rows) {
      db.run(`INSERT INTO model_predictions(forecast_id, match_id, model_name, home_probability, draw_probability, away_probability,
        expected_home_goals, expected_away_goals, generated_at) VALUES(?,?,?,?,?,?,?,?,?)`, forecastId, matchId, r.model, r.p['1'], r.p.X, r.p['2'],
      r.lambdaHome ?? null, r.lambdaAway ?? null, nowSec());
    }
  }

  function saveValueBets(forecastId, matchId, rows) {
    db.run('DELETE FROM value_bets WHERE match_id=? AND outcome IS NULL', matchId);
    for (const v of rows) {
      db.run(`INSERT INTO value_bets(forecast_id, match_id, market, selection, line, odds, model_probability, bookmaker_probability, edge_percent,
        expected_value, kelly_fraction, stake, confidence_score, accepted, discard_reason, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      forecastId, matchId, v.market, v.selection, v.line ?? 0, v.odds, v.probability, v.impliedNoVig ?? v.implied, v.edge, v.ev, v.kelly, v.stake,
      v.confidence, v.accepted ? 1 : 0, v.discardReason ?? null, nowSec());
    }
  }

  function openValueBets(matchId) { return db.all('SELECT * FROM value_bets WHERE match_id=? AND outcome IS NULL', matchId); }
  function settleValueBet(id, outcome, profit) { db.run('UPDATE value_bets SET outcome=?, profit=? WHERE id=?', outcome, profit, id); }

  function valueBetsBetween(fromSec, toSec) {
    return db.all(`SELECT v.*, m.start_time, m.tournament_name, ht.name AS home_name, at.name AS away_name FROM value_bets v
      JOIN matches m ON m.id=v.match_id JOIN teams ht ON ht.id=m.home_team_id JOIN teams at ON at.id=m.away_team_id
      JOIN forecasts f ON f.id=v.forecast_id AND f.is_latest=1
      WHERE m.start_time >= ? AND m.start_time < ? ORDER BY v.accepted DESC, v.expected_value DESC`, fromSec, toSec);
  }

  function settledValueBets() {
    return db.all(`SELECT v.*, m.start_time FROM value_bets v JOIN matches m ON m.id=v.match_id WHERE v.outcome IS NOT NULL ORDER BY m.start_time`);
  }

  function modelPredictionsFor(forecastId) { return db.all('SELECT * FROM model_predictions WHERE forecast_id=?', forecastId); }

  function saveEloSnapshot(teamId, r) {
    db.run(`INSERT INTO elo_ratings(team_id, elo_overall, elo_attack, elo_defense, elo_home, elo_away, games, calculated_at) VALUES(?,?,?,?,?,?,?,?)`,
      teamId, r.elo, r.atk, r.def, r.home ?? null, r.away ?? null, r.games, nowSec());
  }

  function recordTraining(r) {
    db.run(`INSERT INTO ml_training_history(model_name, training_samples, validation_samples, accuracy, logloss, brier, baseline_brier, adopted, reason, started_at, finished_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`, r.model_name, r.training_samples ?? 0, r.validation_samples ?? 0, r.accuracy ?? null, r.logloss ?? null,
    r.brier ?? null, r.baseline_brier ?? null, r.adopted ? 1 : 0, r.reason ?? null, r.started_at ?? nowSec(), nowSec());
  }
  function recordCalibration(r) {
    db.run(`INSERT INTO calibration_results(scope, n, brier_score, logloss, rps, ece, mce, sharpness, method, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      r.scope, r.n, r.brier_score ?? null, r.logloss ?? null, r.rps ?? null, r.ece ?? null, r.mce ?? null, r.sharpness ?? null, r.method ?? 'none', nowSec());
  }
  function recordBacktest(r) {
    db.run(`INSERT INTO backtesting_results(strategy, total_bets, wins, losses, staked, profit, roi, yield, max_drawdown, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      r.strategy, r.totalBets, r.wins, r.losses, r.staked, r.profit, r.roi ?? null, r.yield ?? null, r.maxDrawdown ?? null, nowSec());
  }
  function trainingHistory(limit = 30) { return db.all('SELECT * FROM ml_training_history ORDER BY id DESC LIMIT ?', limit); }
  function latestCalibration() { return db.all('SELECT c.* FROM calibration_results c WHERE c.id IN (SELECT MAX(id) FROM calibration_results GROUP BY scope)'); }

  function picksForForecasts(ids) {
    if (!ids.length) return [];
    return db.all(`SELECT * FROM predictions WHERE is_pick=1 AND forecast_id IN (${ids.map(() => '?').join(',')})`, ...ids);
  }

  function tournamentsList() {
    return db.all(`SELECT DISTINCT m.tournament_id AS id, m.tournament_name AS name FROM forecasts f
      JOIN matches m ON m.id=f.match_id WHERE m.tournament_id IS NOT NULL ORDER BY name`);
  }

  function teamsSearch(q) {
    return db.all('SELECT id, name FROM teams WHERE name LIKE ? ORDER BY name LIMIT 20', `%${q}%`);
  }

  // ---------------------------------------------------------------- parámetros / jobs
  function getParam(key) {
    const r = db.get('SELECT * FROM model_params WHERE key=?', key);
    return r ? { value: JSON.parse(r.value_json), sampleSize: r.sample_size, metric: r.metric_json ? JSON.parse(r.metric_json) : null, updatedAt: r.updated_at } : null;
  }

  function setParam(key, value, sampleSize, metric) {
    const v = JSON.stringify(value);
    const m = metric ? JSON.stringify(metric) : null;
    db.run(`INSERT OR REPLACE INTO model_params(key,value_json,sample_size,metric_json,updated_at) VALUES(?,?,?,?,?)`, key, v, sampleSize ?? null, m, nowSec());
    db.run('INSERT INTO model_params_history(key,value_json,sample_size,metric_json,created_at) VALUES(?,?,?,?,?)', key, v, sampleSize ?? null, m, nowSec());
  }

  function allParams() {
    return db.all('SELECT * FROM model_params').map((r) => ({ key: r.key, value: JSON.parse(r.value_json), sampleSize: r.sample_size, metric: r.metric_json ? JSON.parse(r.metric_json) : null, updatedAt: r.updated_at }));
  }

  function startRun(kind, targetDate) {
    return Number(db.run('INSERT INTO collection_runs(kind,target_date,started_at,status) VALUES(?,?,?,?)', kind, targetDate ?? null, nowSec(), 'running').lastInsertRowid);
  }

  function finishRun(id, status, { requests, summary, error } = {}) {
    db.run('UPDATE collection_runs SET finished_at=?, status=?, requests=?, summary_json=?, error=? WHERE id=?',
      nowSec(), status, requests ?? null, summary ? JSON.stringify(summary) : null, error ?? null, id);
  }

  function lastRuns(limit = 10) { return db.all('SELECT * FROM collection_runs ORDER BY id DESC LIMIT ?', limit); }

  function counts() {
    return db.get(`SELECT (SELECT COUNT(*) FROM matches) AS matches, (SELECT COUNT(*) FROM matches WHERE status='finished') AS finished,
      (SELECT COUNT(*) FROM teams) AS teams, (SELECT COUNT(*) FROM match_stats WHERE available=1) AS stats,
      (SELECT COUNT(*) FROM forecasts) AS forecasts, (SELECT COUNT(*) FROM predictions WHERE outcome IS NOT NULL AND void=0) AS settled`);
  }

  return {
    upsertTeam, upsertTournament, upsertMatch, saveStats, saveIncidents, linkH2H, saveStandings, saveOdds,
    getMatch, matchesBetween, teamHistory, h2hHistory, hasStats, allFinishedMatches, goalBaseline, xgBaseline, standingFor,
    oddsFor, incidentsFor, statsFor, saveForecast, latestForecast, forecastsBetween, predictionsForForecast,
    openPredictionMatches, openPredictionsFor, settlePrediction, setPostAnalysis, settledPredictions, history,
    picksForForecasts, settledLambdas, settledForecastOutputs, saveModelPredictions, saveValueBets, openValueBets, settleValueBet,
    valueBetsBetween, settledValueBets, modelPredictionsFor, saveEloSnapshot, recordTraining, recordCalibration, recordBacktest, trainingHistory,
    latestCalibration, tournamentsList, teamsSearch, getParam, setParam, allParams, startRun, finishRun, lastRuns, counts,
  };
}

module.exports = { createRepositories };
