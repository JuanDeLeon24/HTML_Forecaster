# Auditoría técnica – HTML_FORECASTER (v0.3.0)

> Fecha de auditoría: 2026-11-27 · Ámbito: código fuente (`backend/`, `frontend/`, `standalone/`, `tests/`, documentación).  
> Resultado de pruebas automatizadas: `npm test` → **14/14 OK** (modelos, métricas, mapper, pipeline end-to-end con proveedor sintético).

---

## 1. Alcance y método

Se revisó el repositorio completo, incluyendo:

- Núcleo de dominio: `backend/models`, `backend/analyzers`, `backend/engine`, `backend/validation`, `backend/learning`.
- Recolección y proveedores: `backend/collectors`, `backend/providers/sofascore`.
- Persistencia: `backend/database` (esquema, repositorios, SQLite nativo).
- Servidor y API: `backend/server.js`, `backend/routes`, `backend/services.js`, `backend/cli.js`, `backend/scheduler.js`.
- Frontend: `frontend/assets/*.js`, páginas HTML.
- Versión de archivo único: `standalone/*`, `scripts/build-standalone.js`, `dist/HTML_Forecaster.html`.
- Documentación: `README.md`, `docs/*`.
- Pruebas: `tests/*.test.js`.

La auditoría clasifica los hallazgos en **Crítico / Alto / Medio / Bajo** y propone correcciones concretas y priorizadas.

---

## 2. Resumen ejecutivo

HTML_FORECASTER es un proyecto **maduro para su tamaño**: arquitectura limpia, separación clara por capas, trazabilidad completa de pronósticos, coherencia entre mercados (matriz de marcadores reescalada), aprendizaje automático básico (pesos del ensamble y ρ de Dixon-Coles) y una versión de archivo único que replica el motor en el navegador. Las pruebas pasan y el pipeline end-to-end funciona.

Los principales riesgos no son de corrección inmediata sino de **robustez y cobertura**:

1. **Dependencia única y no oficial de Sofascore** (sin proveedor alternativo implementado).
2. **Sin autenticación** en endpoints de acción (mitigado por bind a `127.0.0.1`, pero frágil).
3. **Cobertura de tests baja** (14 pruebas, sin CI).
4. **Varios subsistemas recogidos pero no consumidos por el modelo** (xG, Elo ofensivo/defensivo).
5. **Limitaciones de modelado declaradas** (fuerzas sin ajuste por rival, Elo no comparable entre ligas, sin contexto: lesiones/árbitro/clima).

No se detectaron vulnerabilidades de inyección SQL ni XSS evidentes en el flujo principal; el código usa consultas parametrizadas y `HF.esc` de forma consistente.

---

## 3. Lo que el sistema hace hoy

### 3.1 Recolección

- Descarga partidos de una fecha (y vecinos para cubrir zona horaria) filtrando por torneos y `MAX_MATCHES`.
- Histórico por equipo (últimos N), estadísticas por partido, H2H, clasificaciones, cuotas.
- Cache permanente de estadísticas (`hasStats` evita re-descargas).
- Reintentos con backoff y rate limit global.
- Versión standalone: importación de `.json` generado por un recolector que corre dentro de sofascore.com (evita HTTP 403 / CORS).

### 3.2 Modelado

- Perfil de equipo: ventanas 5/10/20/50, por sede, fuerzas Maher con decaimiento temporal (vida media 180 d) y encogimiento bayesiano (k = 3).
- Nivel 1 – modelo ponderado (forma, H2H, localía, ataque, defensa → logit ordenado).
- Nivel 2 – Elo general (World Football Elo con K por diferencia de goles y ventaja local 65) + Elo ofensivo/defensivo (calculado, no usado en el pronóstico final).
- Niveles 3/4 – Poisson bivariado + corrección Dixon-Coles (ρ por defecto −0.08, aprendido por MV).
- Mezcla de λ con H2H (≤ 15 %) y reescalado de la matriz para que el 1X2 coincida con el ensamble.
- Corners y tarjetas: modelo genérico de conteos (media de a favor/en contra), mezcla H2H (≤ 20 %), Poisson o Binomial Negativa según sobredispersión.

### 3.3 Salida y reporting

- Mercados: 1X2, DC, O/U 0.5–4.5, BTTS, TEAM_OU, CORNERS, CARDS.
- Marcador exacto, combinaciones (probabilidad conjunta exacta desde la matriz), valor esperado vs. cuotas, ¼ de Kelly.
- Calidad del dato (0–100) y nivel A/B/C/D, índice de confianza.
- Explicación “¿por qué?” con cifras y muestras.
- Análisis post-partido (“¿por qué falló?”) con incidencias, xG vs goles.

### 3.4 Validación y aprendizaje

- Liquidación de predicciones pendientes (partidos ≥ 2.5 h).
- Métricas: Brier, Brier Skill, Log Loss, Accuracy/Precision/Recall/F1, RPS, calibración en 10 tramos, ROI virtual.
- Aprendizaje: pesos del ensamble por rejilla sobre el símplex (encogidos hacia los valores por defecto) y ρ por máxima verosimilitud, con historial auditable (`model_params_history`).

### 3.5 Infraestructura

- API REST documentada, CLI, planificador opcional, jobs en segundo plano con progreso.
- Base de datos SQLite única con esquema migrable a PostgreSQL.
- Frontend sin build (Tailwind/Chart.js) y versión de archivo único autocontenida.

---

## 4. Lo que el sistema NO hace (limitaciones)

### 4.1 Declaradas en documentación

- No ajusta las fuerzas por calidad del rival (lo compensa en parte el Elo).
- Elo no comparable entre ligas sin conexión (copas/internacionales).
- Sin árbitro, clima, lesiones, fatiga, rotaciones (Fase 3).
- Sin recalibración automática (isotónica/Platt) cuando la curva se desvíe.
- Sin ML (Random Forest/XGBoost/etc.) sobre `forecasts.inputs_json`.
- Sin proveedores adicionales implementados (API-Football, Football-Data, Understat, FBref).

### 4.2 No declaradas o parcialmente implementadas

- **xG/xGA se recogen y guardan pero no se usan** en ningún modelo (aunque el roadmap lo menciona).
- **Elo ofensivo/defensivo se calcula pero no se usa** en el pronóstico final (solo el Elo general).
- **No hay ajuste por sede para corners/tarjetas** (se promedian a favor/en contra sin distinguir local/visitante).
- **No hay validación de esquema** de las respuestas del proveedor (un cambio en Sofascore puede romper silenciosamente).
- **No hay CI** ni automatización de pruebas.
- **No hay autenticación** ni control de acceso.
- **No hay migraciones de base de datos versionadas** (solo `CREATE TABLE IF NOT EXISTS`).
- **No hay rotación ni límite de tamaño** del log (`logs/app.log` crece indefinidamente).

---

## 5. Arquitectura y dependencias

### 5.1 Cumplimiento de Clean Architecture

Reglas respetadas en general:

- `models/` y `lib/math.js` son funciones puras.
- `analyzers/` y `engine/` no conocen JSON de proveedores.
- Solo `providers/sofascore/` conoce el formato externo.
- Todo el SQL está en `repositories.js`.

**Desviaciones menores:**

- `engine/forecast.js` importa `config` y `getModelParams` (acoplamiento razonable a la configuración).
- `standalone/main.js` importa directamente `services`, `collectors`, `validation` (necesario para el bundle).
- `backend/services.js` mantiene un singleton `repos` mutable (`setRepos`), lo que complica el aislamiento en tests (se mitiga creando repositorios manualmente).

### 5.2 Dependencias externas

- Producción: solo `express ^4.21.2`.
- Desarrollo: `chart.js`, `esbuild`, `sql.js`, `tailwindcss`.
- Runtime: `node:sqlite` (Node ≥ 22.5).

Riesgo principal: **Node ≥ 22.5** es muy reciente; entornos con Node LTS más antiguo no podrán ejecutar el servidor.

---

## 6. Hallazgos

### 6.1 Críticos / Altos

| ID | Severidad | Descripción | Ubicación |
|---|---|---|---|
| H-01 | **Alto** | Dependencia única y no oficial de Sofascore; no hay proveedor alternativo implementado. Si la API cambia o bloquea, el sistema queda inoperativo. | `backend/providers/index.js`, `backend/providers/sofascore/*` |
| H-02 | **Alto** | Sin autenticación en endpoints de acción (`/collect`, `/forecast`, `/settle`, `/learn`). El bind a `127.0.0.1` mitiga, pero cualquier exposición (proxy, Docker) abre ejecución remota. | `backend/routes/handlers.js`, `backend/server.js` |
| H-03 | **Alto** | Fuerzas de equipo no ajustadas por calidad del rival ni por liga; el modelo puede sobrevalorar equipos de ligas débiles. | `backend/analyzers/teamForm.js` |
| H-04 | **Alto** | Elo global no comparable entre ligas desconectadas; afecta al ensamble cuando hay equipos de distintas competiciones. | `backend/models/elo.js` |

### 6.2 Medios

| ID | Severidad | Descripción | Ubicación |
|---|---|---|---|
| H-05 | **Medio** | `runForecasts` salta partidos con `start_time <= now` por defecto. `npm run forecast -- --date D` para fechas pasadas devuelve 0 pronósticos sin aviso claro. | `backend/engine/forecast.js` (`runForecasts`), `backend/cli.js` |
| H-06 | **Medio** | `HF.today()` usa la zona horaria del navegador, no `config.timezone`; en la versión standalone puede desfasar la fecha respecto al servidor/configuración. | `frontend/assets/common.js` |
| H-07 | **Medio** | `getTeamRecentMatches` pagina hasta 5 veces y devuelve todos los eventos sin truncar temprano; coste de red y tiempo. | `backend/providers/sofascore/client.js` |
| H-08 | **Medio** | Sin validación de esquema de respuestas del proveedor; un cambio en Sofascore puede provocar `undefined` silencioso o crash. | `backend/providers/sofascore/mapper.js` |
| H-09 | **Medio** | Sin CI ni automatización de pruebas (no hay `.github/workflows`). | repositorio |
| H-10 | **Medio** | Cobertura de tests baja: 14 pruebas, sin pruebas para `teamForm`, `quality`, `explain`, `valuebets`, `forecast` completo, `settle`, `learning` con datos reales. | `tests/*` |
| H-11 | **Medio** | Sin autenticación/autorización; sin rate limiting en la API. | `backend/server.js`, `backend/routes/api.js` |
| H-12 | **Medio** | xG recogido pero no consumido por el modelo (a pesar de figurar en roadmap). | `backend/analyzers/teamForm.js` (campo `xg`), `backend/models/*` |
| H-13 | **Medio** | Elo ofensivo/defensivo calculado pero no usado en el pronóstico final. | `backend/models/elo.js`, `backend/engine/forecast.js` |
| H-14 | **Medio** | Umbrales de aprendizaje altos (30 partidos para pesos, 150 para ρ) pueden no activarse nunca en uso personal. | `backend/learning/weights.js` |
| H-15 | **Medio** | Sin recalibración automática (isotónica/Platt) cuando la curva de calibración se desvía. | `backend/validation/*` |
| H-16 | **Medio** | `settledPredictions` interpola `LIMIT` con `Number(limit)` en SQL (seguro pero no parametrizado). | `backend/database/repositories.js` |

### 6.3 Bajos

| ID | Severidad | Descripción | Ubicación |
|---|---|---|---|
| H-17 | **Bajo** | `fitRho` permite ρ positivo hasta 0.1; la literatura suele usar ρ ∈ [−0.2, 0]. | `backend/models/poisson.js` (`fitRho`) |
| H-18 | **Bajo** | Log de la aplicación crece sin límite ni rotación. | `backend/lib/logger.js` |
| H-19 | **Bajo** | `dispatch` detecta `{status,body}` con exactamente 2 claves; un handler que devuelva esas claves por casualidad se interpretaría mal. | `backend/routes/handlers.js` |
| H-20 | **Bajo** | Sin migraciones versionadas de BD; cambios de esquema requieren SQL manual. | `backend/database/db.js` |
| H-21 | **Bajo** | Corners/tarjetas tratan home/away de forma simétrica (sin factor de sede). | `backend/analyzers/countModel.js` |
| H-22 | **Bajo** | `confidenceIndex` y calidad no tienen test dedicado. | `backend/engine/quality.js` |
| H-23 | **Bajo** | El bundle standalone es muy grande (~MB) por incluir Chart.js y sql.js; tiempo de carga. | `scripts/build-standalone.js` |
| H-24 | **Bajo** | `quality.freshness` usa el mínimo de los últimos partidos de ambos equipos; si uno no tiene partidos, la frescura es 0 y `staleDays` null. | `backend/engine/quality.js` |

---

## 7. Mejoras recomendadas (priorizadas)

### Prioridad 1 – Robustez y operación

1. **Añadir al menos un proveedor alternativo** (Football-Data o API-Football) implementando `BaseProvider`. El diseño ya lo permite; falta el código.
2. **Autenticación mínima** para endpoints de acción: token en header (`X-API-Key`) o basic auth cuando `HOST !== 127.0.0.1`. Documentar.
3. **Exponer `includeStarted`** en CLI/API para recalcular pronósticos históricos (`npm run forecast -- --date D --include-started`).
4. **CI con `npm test`** en GitHub Actions (Node 22.5+).
5. **Validación de esquema** de respuestas del proveedor (zod o validación manual) para fallar de forma controlada.

### Prioridad 2 – Modelado

6. **Incorporar xG/xGA** como entrada adicional (al menos como feature en el modelo ponderado o como ajuste de λ).
7. **Usar Elo ofensivo/defensivo** en el cálculo de λ (actualmente solo el general).
8. **Ajustar fuerzas por calidad del rival** (regresión Poisson con decaimiento temporal, como indica el roadmap).
9. **Recalibración automática** (Platt/isotónica) cuando el Brier Skill caiga por debajo de un umbral.
10. **Añadir factor de sede** a corners/tarjetas.

### Prioridad 3 – Calidad y mantenimiento

11. **Ampliar tests**: `teamForm`, `quality`, `explain`, `valuebets`, `forecast` (con FakeProvider), `settle`, `learning`.
12. **Migraciones versionadas** de base de datos.
13. **Rotación de logs** (`backend/lib/logger.js`).
14. **Reducir umbrales de aprendizaje** o permitir aprendizaje parcial con menos muestra.
15. **Restringir ρ a [−0.2, 0]** en `fitRho`.

### Prioridad 4 – UX / Frontend

16. **Sincronizar `HF.today()` con `config.timezone`** en la versión standalone.
17. **Mostrar advertencia clara** cuando `forecast` devuelve 0 por partidos ya iniciados.
18. **Indicador de estado del proveedor** en el dashboard (último error, tasa de 403).
19. **Paginación/virtualización** en historial para bases grandes.

---

## 8. Correcciones concretas propuestas

### 8.1 Permitir recalcular pronósticos históricos (H-05)

`backend/cli.js`:

```js
case 'forecast': result = services.forecast(date, { includeStarted: process.argv.includes('--include-started') }); break;
```

`backend/services.js`:

```js
function forecast(date, opts = {}) {
  const [from, to] = dayRange(date);
  return runForecasts(from, to, { repos: getRepos(), ...opts });
}
```

`runForecasts` ya acepta `includeStarted`; solo falta exponerlo.

### 8.2 Zona horaria en el frontend (H-06)

En `standalone/main.js`, exponer `config.timezone` y en `frontend/assets/common.js`:

```js
today() {
  const tz = window.HF?.timezone || 'UTC';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}
```

### 8.3 Restringir ρ (H-17)

En `backend/models/poisson.js`, cambiar la firma por defecto:

```js
function fitRho(samples, { grid = [-0.2, 0, 0.005], minSamples = 150 } = {}) { ... }
```

### 8.4 Truncar temprano en `getTeamRecentMatches` (H-07)

En `backend/providers/sofascore/client.js`:

```js
if (events.length >= limit + 5) break;
```

ya existe; añadir `return events.slice(0, limit + 5).map(map.mapEvent)...` para no mapear páginas extra.

### 8.5 Rotación de logs (H-18)

En `backend/lib/logger.js`, abrir el stream con rotación por tamaño o por día, o usar `fs.createWriteStream` con `flags: 'a'` y renombrar cuando supere N MB.

### 8.6 Autenticación mínima (H-02)

En `backend/server.js`, añadir middleware condicional:

```js
if (process.env.API_TOKEN) {
  app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next();
    if (req.headers['x-api-token'] !== process.env.API_TOKEN) return res.status(401).json({ error: 'No autorizado' });
    next();
  });
}
```

### 8.7 Validación de esquema del proveedor (H-08)

Añadir en `mapper.js` funciones `validateEvent(e)` que devuelvan `null` si faltan campos críticos (`id`, `startTimestamp`, `homeTeam`, `awayTeam`), y en `client.js` filtrar eventos inválidos en lugar de mapearlos.

---

## 9. Testing y calidad

**Estado actual:** 14 pruebas, todas pasan. Cubren modelos matemáticos, métricas, liquidación, combinaciones, reescalado, mapper y pipeline completo con `FakeProvider`.

**Lagunas críticas:**

- No hay pruebas para `teamForm.buildTeamProfile` (ventanas, decaimiento, encogimiento).
- No hay pruebas para `quality.assessQuality` ni `confidenceIndex`.
- No hay pruebas para `explain.explain`.
- No hay pruebas para `valuebets.impliedNoVig` / `valueOf`.
- No hay pruebas para `settle.settlePending` / `settleMatch` con datos reales.
- No hay pruebas para `learning.weights.learnEnsembleWeights` / `learnRho` con datos reales (solo un test sintético aislado).
- No hay pruebas para `forecast.forecastMatch` con `FakeProvider` directamente (el pipeline test lo cubre indirectamente).

**Recomendación:** alcanzar cobertura ≥ 70 % en `backend/` con `node:test` + `c8`.

---

## 10. Seguridad

- **Inyección SQL:** no se detecta; todas las consultas usan parámetros (`?`). La única interpolación (`LIMIT ${Number(limit)}`) convierte a número.
- **XSS:** el frontend usa `HF.esc` de forma consistente en `innerHTML`. Los enlaces usan `URLSearchParams` (codificación automática). No se detectan vectores evidentes.
- **CORS:** la versión standalone solo envía `Accept` para evitar preflight; el servidor no configura CORS (solo mismo origen).
- **Secretos:** `.env` está en `.gitignore`; `.env.example` no contiene secretos.
- **Dependencias:** sin auditoría de vulnerabilidades automatizada (`npm audit` no ejecutado en CI).
- **Riesgo principal:** endpoints de acción sin autenticación (ver H-02).

---

## 11. Performance y escalabilidad

- **SQLite** con WAL y `busy_timeout=5000` es adecuado para uso personal/monousuario.
- **`computeRatings`** se recalcula desde cero en cada ejecución de `runForecasts` (O(n) sobre partidos históricos); aceptable hasta ~10⁵ partidos.
- **`allFinishedMatches`** sin límite; podría consumir memoria en bases muy grandes.
- **HTTP**: rate limit global y reintentos; el recolector puede tardar minutos/horas con todos los torneos.
- **Frontend**: sin virtualización; historiales grandes pueden ralentizar el navegador.
- **Standalone**: bundle de varios MB; carga inicial lenta en conexiones lentas.

---

## 12. Frontend y UX

- Diseño responsive, modo claro/oscuro, tablas con búsqueda/orden/paginación propia.
- La página de análisis es rica (modelos, mercados, heatmap, explicación, H2H, calidad, valor, combinador).
- **Inconsistencia:** el header no enlaza a `/analysis` directamente (solo vía partidos).
- **Feedback:** los mensajes de error se muestran en línea; no hay toasts globales.
- **Accesibilidad:** foco y ARIA limitados; los gráficos dependen de color.
- **Standalone:** el flujo de importación `.json` es complejo pero bien documentado en la UI.

---

## 13. Roadmap sugerido (alineado con docs/ROADMAP.md)

| Fase | Contenido | Prioridad |
|---|---|---|
| 1 | Proveedor alternativo + autenticación + CI | Alta |
| 2 | `includeStarted` en forecast + validación de esquema + rotación de logs | Alta |
| 3 | Incorporar xG y Elo ofensivo/defensivo al modelo | Media |
| 4 | Ajuste de fuerzas por rival (regresión Poisson con decaimiento) | Media |
| 5 | Recalibración automática (Platt/isotónica) | Media |
| 6 | Ampliar cobertura de tests a ≥ 70 % | Media |
| 7 | ML (walk-forward) sobre `forecasts.inputs_json` | Baja |
| 8 | Contexto (lesiones, árbitro, clima, fatiga) | Baja |
| 9 | PostgreSQL + Docker + autenticación completa | Baja |

---

## 14. Conclusión

HTML_FORECASTER es un proyecto **bien estructurado y funcional**, con una base técnica sólida (modelos probabilísticos coherentes, trazabilidad, aprendizaje, validación). Las principales debilidades son la **dependencia de una API no oficial**, la **ausencia de autenticación**, la **cobertura de tests limitada** y varios **subsistemas recogidos pero no consumidos** (xG, Elo ofensivo/defensivo). Ninguna de estas debilidades impide su uso personal, pero conviene abordarlas antes de exponer el servicio o escalar el uso.

La auditoría no encontró errores que provoquen resultados incorrectos en el pipeline principal; las 14 pruebas automatizadas pasan y el pipeline end-to-end con proveedor sintético funciona correctamente.

---

*Generado por auditoría automatizada sobre el estado del repositorio al 2026-11-27.*