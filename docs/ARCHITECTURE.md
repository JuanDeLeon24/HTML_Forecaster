# Arquitectura

```
frontend/                 HTML + Tailwind + Chart.js + DataTables (sin build)
  index.html  analysis.html  stats.html  history.html  assets/
backend/
  server.js               Express: /api + estáticos
  cli.js  scheduler.js    entradas alternativas (CLI, planificador opcional)
  services.js             casos de uso (collect, forecast, settle, learn, daily)
  config.js               toda la configuración y parámetros por defecto
  providers/              ── Data Sources ──
    BaseProvider.js       contrato y objetos canónicos
    sofascore/            client.js (HTTP) + mapper.js (JSON → canónico)
    index.js              registro de proveedores
  collectors/             ── Recolección ── fixtures, historical (equipos, stats, H2H, clasificaciones), results
  analyzers/              ── Analytics Engine ── teamForm, h2h, goals, corners, cards, countModel, results, valuebets
  models/                 ── Modelos ── poisson (+Dixon-Coles), elo, weighted
  engine/                 ── Forecast/Reporting Engine ── forecast, combinations, ranking, quality, explain, markets
  validation/             ── Validation Engine ── settle, metrics, failureAnalysis
  learning/               ── Learning Engine ── weights (ensamble, ρ), params
  database/               schema.sql, db.js (node:sqlite), repositories.js (todo el SQL)
  lib/                    http con rate limit/reintentos, logger, math, dates, jobs
tests/                    node:test (modelos, métricas, mapper, pipeline end-to-end)
docs/
```

## Reglas de dependencia (Clean Architecture)

- `models/` y `lib/math.js` son funciones puras: no conocen la base ni la red.
- `analyzers/` y `engine/` trabajan con filas de la base y objetos canónicos, nunca con JSON de un proveedor.
- Solo `providers/<x>/` conoce el formato de una fuente externa.
- Solo `database/repositories.js` contiene SQL → migrar a PostgreSQL implica reescribir `db.js` y adaptar ese archivo.
- `services.js` orquesta; API, CLI y planificador solo llaman a servicios.

## Flujo diario

```
settle  → refresca partidos terminados → liquida predicciones → análisis post-partido
learn   → pesos del ensamble (Brier) y ρ Dixon-Coles (MV), encogidos hacia los valores por defecto
collect → partidos del día → últimos N de cada equipo → estadísticas → H2H → clasificación → cuotas
forecast→ para cada partido NO iniciado: perfiles → λ → matriz DC → Elo → ponderado → ensamble →
          matriz reescalada → corners/tarjetas → EV → calidad → explicación → guardar
```

## Trazabilidad

Cada fila de `forecasts` guarda versión de modelo, parámetros efectivos (incluidos los aprendidos),
entradas (medias, muestras, H2H, pool de normalización), salida completa y calidad. Cada selección
binaria se guarda en `predictions` (con la probabilidad de cada submodelo para el 1X2). Al
re-pronosticar un partido, las predicciones pendientes anteriores se anulan: solo cuenta la última
versión emitida antes del inicio. Los cambios de parámetros quedan en `model_params_history`.

## Base de datos

Un único archivo SQLite (`data/forecaster.db`) con tablas separadas (teams, tournaments, matches,
match_stats, match_incidents, h2h_links, standings, odds, forecasts, predictions, model_params,
collection_runs). Se eligió un archivo en lugar de teams.db/matches.db/predictions.db porque las
consultas cruzan esas entidades constantemente (joins) y las transacciones deben ser atómicas.

## Añadir un proveedor

1. Crear `backend/providers/<nombre>/client.js` que extienda `BaseProvider` y devuelva objetos canónicos.
2. Registrarlo en `backend/providers/index.js`.
3. `DATA_PROVIDER=<nombre>`.

Los IDs llevan prefijo de proveedor (`sofascore:team:44`), por lo que varias fuentes pueden convivir.
