# API REST

Base: `http://127.0.0.1:3000/api`. Fechas `YYYY-MM-DD` en la zona `TIMEZONE`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Versión, proveedor, conteos y últimas ejecuciones |
| GET | `/matches?date=` | Partidos de la fecha con resumen de pronóstico |
| GET | `/forecasts/:matchId` | Pronóstico completo, predicciones, cuotas, incidencias y estadísticas |
| GET | `/rankings?date=&limit=` | Top: confidence, value, combinations, btts, over, under, corners, cards |
| POST | `/combination` | `{ matchId, legs: [{market, selection, line}] }` → probabilidad conjunta |
| GET | `/performance?from=&to=&market=&tournament=&team=` | Métricas y calibración |
| GET | `/history?from=&to=&tournament=&team=` | Historial de pronósticos |
| GET | `/teams?q=` | Búsqueda de equipos |
| GET | `/model` | Parámetros efectivos y aprendidos |
| POST | `/collect` | `{ date }` → tarea en segundo plano (recolectar + pronosticar) |
| POST | `/forecast` | `{ date }` → recalcula pronósticos (síncrono) |
| POST | `/settle` | Tarea en segundo plano: liquidar resultados |
| POST | `/learn` | Reajusta parámetros |
| GET | `/jobs`, `/jobs/:id` | Estado y progreso de tareas |

Mercados (`market` / `selection` / `line`): `1X2` 1·X·2 · `DC` 1X·X2·12 · `OU` over·under 0.5–4.5 ·
`BTTS` yes·no · `TEAM_OU` home·away 0.5–2.5 · `CORNERS` over·under 7.5–11.5 · `CARDS` over·under 2.5–5.5.

Los endpoints de acción no tienen autenticación: por eso el servidor escucha en `127.0.0.1` por
defecto. Añade autenticación antes de exponerlo públicamente.
