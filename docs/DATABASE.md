# Base de datos

Esquema: `backend/database/schema.sql` · migraciones: `backend/database/migrations.js` · todo el SQL: `backend/database/repositories.js`.

| Tabla de la especificación | Tabla en el proyecto | Notas |
|---|---|---|
| leagues | `tournaments` | id con prefijo de proveedor (`sofascore:ut:17`) |
| teams | `teams` | |
| matches | `matches` | marcador a 90', medio tiempo, estado, temporada, ronda |
| team_statistics | `match_stats` | posesión, tiros, tiros al arco, xG (xGA = xG del rival), corners, faltas, amarillas, rojas |
| — | `match_incidents` | goles, expulsiones, penales fallados (análisis de fallos) |
| elo_ratings | `elo_ratings` | general, ataque, defensa, local, visitante |
| odds | `odds` | una fila por mercado/selección/línea |
| predictions | `model_predictions` (1X2 por modelo) + `predictions` (cada selección binaria del ensamble, cruda y calibrada) | |
| ensemble_predictions | `forecasts` (instantánea completa) + `predictions` | trazabilidad total: entradas, parámetros, salida, calidad |
| value_bets | `value_bets` | incluye descartadas con motivo y resultado al liquidar |
| calibration_results | `calibration_results` | por mercado: Brier, LogLoss, ECE, MCE, Sharpness, método |
| backtesting_results | `backtesting_results` | por estrategia |
| ml_training_history | `ml_training_history` | cada decisión de aprendizaje, adoptada o no, con su motivo |
| system_logs | archivos `logs/*.log` | |
| — | `model_params` / `model_params_history` | parámetros aprendidos y su historial |
| Vistas | `recent_matches`, `model_roi` | |
