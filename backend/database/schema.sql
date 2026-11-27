-- HTML_FORECASTER – esquema SQLite (MVP). Compatible en lo esencial con PostgreSQL.
-- Los IDs son texto con prefijo de proveedor ("sofascore:44") para permitir
-- varias fuentes de datos sin colisiones.

CREATE TABLE IF NOT EXISTS tournaments (
  id            TEXT PRIMARY KEY,
  provider      TEXT NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id            TEXT PRIMARY KEY,
  provider      TEXT NOT NULL,
  name          TEXT NOT NULL,
  short_name    TEXT,
  country       TEXT,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id              TEXT PRIMARY KEY,
  provider        TEXT NOT NULL,
  provider_ref    TEXT,               -- id alternativo (p. ej. customId de Sofascore para H2H)
  tournament_id   TEXT REFERENCES tournaments(id),
  tournament_name TEXT,
  season_id       TEXT,
  round           TEXT,
  start_time      INTEGER NOT NULL,   -- unix segundos
  status          TEXT NOT NULL,      -- notstarted | inprogress | finished | postponed | canceled | unknown
  home_team_id    TEXT NOT NULL REFERENCES teams(id),
  away_team_id    TEXT NOT NULL REFERENCES teams(id),
  home_goals      INTEGER,            -- marcador a 90' (tiempo reglamentario)
  away_goals      INTEGER,
  home_goals_ht   INTEGER,
  away_goals_ht   INTEGER,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_time ON matches(start_time);
CREATE INDEX IF NOT EXISTS idx_matches_home ON matches(home_team_id, start_time);
CREATE INDEX IF NOT EXISTS idx_matches_away ON matches(away_team_id, start_time);

-- available = 0 significa "el proveedor no tiene estadísticas" (no se reintenta)
CREATE TABLE IF NOT EXISTS match_stats (
  match_id        TEXT PRIMARY KEY REFERENCES matches(id),
  available       INTEGER NOT NULL,
  home_corners    INTEGER, away_corners    INTEGER,
  home_yellow     INTEGER, away_yellow     INTEGER,
  home_red        INTEGER, away_red        INTEGER,
  home_shots      INTEGER, away_shots      INTEGER,
  home_sot        INTEGER, away_sot        INTEGER,
  home_possession REAL,    away_possession REAL,
  home_fouls      INTEGER, away_fouls      INTEGER,
  home_xg         REAL,    away_xg         REAL,
  fetched_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS match_incidents (
  match_id   TEXT NOT NULL REFERENCES matches(id),
  type       TEXT NOT NULL,        -- goal | red_card | yellow_card | penalty_miss | substitution
  minute     INTEGER,
  side       TEXT,                 -- home | away
  player     TEXT,
  detail     TEXT
);
CREATE INDEX IF NOT EXISTS idx_incidents_match ON match_incidents(match_id);

CREATE TABLE IF NOT EXISTS h2h_links (
  match_id      TEXT NOT NULL,     -- partido programado
  h2h_match_id  TEXT NOT NULL,     -- enfrentamiento histórico
  PRIMARY KEY (match_id, h2h_match_id)
);

CREATE TABLE IF NOT EXISTS standings (
  tournament_id TEXT NOT NULL,
  season_id     TEXT NOT NULL,
  team_id       TEXT NOT NULL,
  position      INTEGER, points INTEGER, played INTEGER,
  wins INTEGER, draws INTEGER, losses INTEGER,
  goals_for INTEGER, goals_against INTEGER,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (tournament_id, season_id, team_id)
);

CREATE TABLE IF NOT EXISTS odds (
  match_id   TEXT NOT NULL,
  market     TEXT NOT NULL,        -- 1X2 | DC | OU | BTTS
  selection  TEXT NOT NULL,        -- 1 | X | 2 | 1X | over | yes ...
  line       REAL NOT NULL DEFAULT 0,
  decimal_odds REAL NOT NULL,
  source     TEXT,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, market, selection, line)
);

-- Instantánea completa de cada pronóstico (trazabilidad total)
CREATE TABLE IF NOT EXISTS forecasts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id        TEXT NOT NULL REFERENCES matches(id),
  created_at      INTEGER NOT NULL,
  model_version   TEXT NOT NULL,
  params_json     TEXT NOT NULL,
  inputs_json     TEXT NOT NULL,     -- datos de entrada (medias, muestras, Elo...)
  output_json     TEXT NOT NULL,     -- probabilidades, matriz, explicación
  quality_json    TEXT NOT NULL,
  post_analysis_json TEXT,           -- análisis tras el partido (por qué falló)
  is_latest       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_forecasts_match ON forecasts(match_id, is_latest);

-- Una fila por evento binario pronosticado (base de métricas)
CREATE TABLE IF NOT EXISTS predictions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  forecast_id   INTEGER NOT NULL REFERENCES forecasts(id),
  match_id      TEXT NOT NULL REFERENCES matches(id),
  market        TEXT NOT NULL,      -- 1X2 | DC | OU | BTTS | CORNERS | CARDS | TEAM_OU
  selection     TEXT NOT NULL,
  line          REAL NOT NULL DEFAULT 0,
  probability   REAL NOT NULL,
  components_json TEXT,             -- probabilidad de cada submodelo
  odds          REAL,
  is_pick       INTEGER NOT NULL DEFAULT 0,
  outcome       INTEGER,            -- 1 ocurrió, 0 no, NULL pendiente
  void          INTEGER NOT NULL DEFAULT 0,
  settled_at    INTEGER,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pred_match ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_pred_open ON predictions(outcome, void);

CREATE TABLE IF NOT EXISTS model_params (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  sample_size INTEGER,
  metric_json TEXT,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS model_params_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL,
  value_json  TEXT NOT NULL,
  sample_size INTEGER,
  metric_json TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,
  target_date TEXT,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  status      TEXT NOT NULL,
  requests    INTEGER,
  summary_json TEXT,
  error       TEXT
);

-- ===================== Tablas de la especificación Enterprise =====================

-- Instantáneas de Elo (general, ofensivo, defensivo, local y visitante)
CREATE TABLE IF NOT EXISTS elo_ratings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id       TEXT NOT NULL REFERENCES teams(id),
  elo_overall   REAL NOT NULL,
  elo_attack    REAL NOT NULL,
  elo_defense   REAL NOT NULL,
  elo_home      REAL,
  elo_away      REAL,
  games         INTEGER NOT NULL,
  calculated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_elo_team ON elo_ratings(team_id, calculated_at);

-- Probabilidades 1X2 de cada modelo individual por pronóstico (comparador de modelos)
CREATE TABLE IF NOT EXISTS model_predictions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  forecast_id         INTEGER NOT NULL REFERENCES forecasts(id),
  match_id            TEXT NOT NULL REFERENCES matches(id),
  model_name          TEXT NOT NULL,
  home_probability    REAL NOT NULL,
  draw_probability    REAL NOT NULL,
  away_probability    REAL NOT NULL,
  expected_home_goals REAL,
  expected_away_goals REAL,
  generated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_modelpred_match ON model_predictions(match_id);

-- Apuestas de valor detectadas en el momento del pronóstico (antes del partido)
CREATE TABLE IF NOT EXISTS value_bets (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  forecast_id           INTEGER NOT NULL REFERENCES forecasts(id),
  match_id              TEXT NOT NULL REFERENCES matches(id),
  market                TEXT NOT NULL,
  selection             TEXT NOT NULL,
  line                  REAL NOT NULL DEFAULT 0,
  odds                  REAL NOT NULL,
  model_probability     REAL NOT NULL,
  bookmaker_probability REAL NOT NULL,
  edge_percent          REAL NOT NULL,
  expected_value        REAL NOT NULL,
  kelly_fraction        REAL NOT NULL,
  stake                 REAL NOT NULL,
  confidence_score      REAL NOT NULL,
  accepted              INTEGER NOT NULL,      -- 1 recomendada, 0 descartada
  discard_reason        TEXT,
  outcome               INTEGER,
  profit                REAL,
  created_at            INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_value_match ON value_bets(match_id);

CREATE TABLE IF NOT EXISTS calibration_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  scope       TEXT NOT NULL,                 -- mercado o modelo
  n           INTEGER NOT NULL,
  brier_score REAL, logloss REAL, rps REAL, ece REAL, mce REAL, sharpness REAL,
  method      TEXT,                          -- none | platt | isotonic
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS backtesting_results (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy     TEXT NOT NULL,
  total_bets   INTEGER NOT NULL,
  wins         INTEGER NOT NULL,
  losses       INTEGER NOT NULL,
  staked       REAL NOT NULL,
  profit       REAL NOT NULL,
  roi          REAL,
  yield        REAL,
  max_drawdown REAL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ml_training_history (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  model_name        TEXT NOT NULL,
  training_samples  INTEGER NOT NULL,
  validation_samples INTEGER NOT NULL,
  accuracy          REAL,
  logloss           REAL,
  brier             REAL,
  baseline_brier    REAL,
  adopted           INTEGER NOT NULL,
  reason            TEXT,
  started_at        INTEGER NOT NULL,
  finished_at       INTEGER NOT NULL
);

-- Vistas
CREATE VIEW IF NOT EXISTS recent_matches AS
  SELECT m.*, ht.name AS home_name, at.name AS away_name FROM matches m
  JOIN teams ht ON ht.id = m.home_team_id JOIN teams at ON at.id = m.away_team_id
  ORDER BY m.start_time DESC;

CREATE VIEW IF NOT EXISTS model_roi AS
  SELECT strategy, AVG(roi) AS avg_roi, SUM(profit) AS total_profit, MAX(created_at) AS last_run
  FROM backtesting_results GROUP BY strategy;
