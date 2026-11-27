# Cumplimiento de la especificación «Football Statistical Intelligence Platform (Enterprise)»

Estado a la versión 0.4.0. ✅ cumplido · 🟡 parcial (se explica qué falta) · ❌ pendiente (con motivo).

## Restricción que condiciona todo

El equipo donde se usa la herramienta **no permite instalar software**. Por eso existen dos formas de
ejecución con el **mismo motor**:

| Modo | Uso |
|---|---|
| `dist/HTML_Forecaster.html` (archivo único) | Doble clic, sin instalar nada. Motor, SQLite (WebAssembly) y gráficos dentro del archivo. Datos en el navegador. |
| Servidor local `http://localhost:3000` (Node.js) | Donde sí se pueda instalar Node. Añade archivos de log, copias de seguridad automáticas, token y límite de peticiones. |

La especificación pide TypeScript + React + Vite + Docker. **No se migró** (ver abajo): reescribir la
interfaz y el motor no mejora ninguna predicción, rompería el archivo único que hoy es la única forma de
usar la herramienta en el equipo de trabajo y retrasaría la validación con datos reales.

## Matriz

### Funcionamiento y datos
| Requisito | Estado | Dónde / notas |
|---|---|---|
| Ejecución local, almacenamiento y caché local | ✅ | SQLite local (servidor) o en el navegador (archivo único). Las estadísticas de partidos terminados se guardan una vez y se reutilizan. |
| Funcionamiento sin conexión / conservar histórico si la API cae | ✅ | Todo el análisis usa la base local; solo la recolección necesita red. |
| Sofascore: fixtures, odds, H2H, estadísticas, xG, rankings, eventos | ✅ | `providers/sofascore`. xG llega en las estadísticas cuando Sofascore lo publica. |
| Sofascore: alineaciones, lesiones, live scores | ❌ | Requiere nuevos endpoints y validar su impacto; siguiente fase de datos. |
| Torneos (Premier, Championship, LaLiga, Bundesliga, Serie A, Ligue 1, UCL, UEL, UECL) | ✅ | Configuración por defecto (`TOURNAMENTS` / «Datos y ajustes»). |
| Respaldo automático Football-Data / API-Football / TheSportsDB / Understat / FBref | ❌ | La arquitectura lo admite (`providers/BaseProvider.js` + registro); falta implementar cada cliente. Varios requieren clave de API y bloquean peticiones desde navegador. |
| Validación obligatoria de IDs, fechas, resultados, cuotas, estadísticas, xG, torneos | ✅ | `validators/index.js`, aplicada en el único punto de entrada a la base (`repositories.js`) y antes de guardar cada pronóstico. |
| Sin null inesperados/undefined/NaN/Infinity/negativos/probabilidades fuera de [0,1] | ✅ | Partido inválido → rechazado; estadística inválida → campo anulado; pronóstico inválido → no se guarda. |
| Registro de errores con timestamp, API, endpoint, error, impacto en `logs/errors.log` | ✅ | `lib/logger.js` (servidor). En el archivo único: «Datos y ajustes → Errores registrados». |

### Base de datos
| Requisito | Estado | Notas |
|---|---|---|
| SQLite inicial / PostgreSQL escalable | ✅ / 🟡 | Todo el SQL vive en `database/repositories.js` → migrar a PostgreSQL es reescribir ese archivo y `db.js`. |
| Tablas: matches, team statistics, elo_ratings, odds, predictions, ensemble predictions, value_bets, calibration_results, backtesting_results, ml_training_history | ✅ | Equivalencias en `docs/DATABASE.md`. `system_logs` va a archivos de log. |
| Vistas `recent_matches`, `model_roi` | ✅ | `schema.sql`. |
| Migraciones | ✅ | `database/migrations.js` (también actualiza la base guardada en el navegador). |

### Modelos
| # | Modelo | Estado | Notas |
|---|---|---|---|
| 1 | Poisson clásico | ✅ | Referencia en el comparador. |
| 2 | Poisson bivariado | ✅ | Karlis-Ntzoufras, `models/bivariatePoisson.js`. |
| 3 | Dixon-Coles | ✅ | ρ aprendido por máxima verosimilitud. |
| 4–6 | Elo global, ofensivo, defensivo | ✅ | + Elo local y visitante. |
| 7–8 | xG / xGA | ✅ | Fuerzas con goles esperados; peso 0 si no hay cobertura. |
| 9 | Bayesian updating | ✅ | Posterior Gamma-Poisson explícito con desviación típica. |
| 10 | Cadenas de Markov | ❌ | Sin datos minuto a minuto suficientes para estimar transiciones sin inventar parámetros. |
| 11 | Regresión logística | ✅ | Entrena solo con partidos jugados; se adopta si supera a Dixon-Coles fuera de muestra. |
| 12–15 | Random Forest, Gradient Boosting, XGBoost, LightGBM | ❌ | Necesitan miles de partidos liquidados para no sobreajustar y un entorno Python/ONNX que no puede instalarse en el equipo de trabajo. Siguiente fase cuando haya datos. |
| 16 | Ensemble meta-model | ✅ | Poisson-DC + Elo + Ponderado + xG + Logística, pesos aprendidos. |

### Variables
| Variable | Estado |
|---|---|
| Forma 5/10/20 (+50), local/visitante/general | ✅ |
| Ataque: goles, tiros, tiros al arco, conversión, xG | ✅ |
| Defensa: goles recibidos, xGA, porterías a cero, tiros permitidos | ✅ |
| Disciplina: tarjetas, faltas, expulsiones | ✅ (se muestran; tarjetas modeladas) |
| Juego aéreo: corners a favor y en contra | ✅ |
| Mercado: cuotas | 🟡 una captura por recolección; apertura/cierre y movimientos requieren capturas repetidas |
| Físico: descanso, congestión 7/14 días | ✅ · viajes ❌ (sin dato de sede/distancias) |
| Contexto: clasificación | ✅ · motivación/importancia ❌ (no hay dato objetivo fiable) |

### Calibración, aprendizaje y validación
| Requisito | Estado |
|---|---|
| Brier, LogLoss, RPS, ECE, MCE, Sharpness | ✅ |
| Curva de calibración, diagrama de fiabilidad, distribución de sharpness | ✅ |
| Isotonic Regression y Platt Scaling automáticos | ✅ solo si mejoran fuera de muestra con ≥ 300 predicciones del mercado |
| Aprendizaje tras cada partido: histórico, métricas, precisión, calibración, pesos | ✅ «Liquidar resultados» / importación / planificador |
| No cambiar pesos con muestra insuficiente, alta varianza o sobreajuste | ✅ reglas explícitas + historial de decisiones |
| Walk-forward, time-series CV, rolling y expanding window | ✅ `learning/walkForward.js` |
| Detección de deriva | ✅ congela pesos si el error reciente se dispara |
| Sin datos futuros ni fuga de información | ✅ solo partidos anteriores al inicio; solo se pronostica antes del pitazo |

### Valor, confianza y explicabilidad
| Requisito | Estado |
|---|---|
| Edge, EV, EV+, Kelly, Kelly fraccional, stake sugerido | ✅ |
| Descarte por mala calibración, poca liquidez (margen alto) y confianza baja | ✅ con motivo visible |
| Score de confianza 0–100 con factores y niveles A+…D | ✅ |
| Factores principales («Localía +12%») | ✅ por ablación sobre todos los modelos |
| Feature importance | ✅ coeficientes estandarizados de la logística · SHAP ❌ (no hay modelos de árboles) |

### Dashboard, monitoreo, operación
| Requisito | Estado |
|---|---|
| Inicio con partidos, oportunidades y rendimiento histórico | ✅ |
| Partido: ganador, probabilidad, marcador, over/under, BTTS | ✅ |
| Modelos individuales y comparador | ✅ |
| Calibración (curvas, error) y backtesting (ROI, Yield, Profit, Drawdown) | ✅ |
| Monitoreo diario/semanal/mensual | ✅ |
| Reportes descargables | 🟡 exportación de la base (.sqlite); informes PDF/CSV pendientes |
| Logs system/predictions/errors/api con rotación | ✅ servidor |
| Backups diario/semanal/mensual con restauración automática | ✅ servidor · archivo único: exportar/importar manual |
| Token de API, rate limiting, auditoría | ✅ servidor · JWT/login ❌ (uso local de una persona) |
| Rendimiento (< 500 ms por probabilidad) | ✅ ~10 ms por partido con los 8 modelos y la ablación |
| Tests unitarios, integración, regresión, estadísticos | ✅ 27 pruebas · cobertura 93 % de líneas de los módulos del motor (`npm run coverage`) · el frontend no tiene pruebas automatizadas, se verifica en navegador |
| TypeScript, React, Vite, Docker | ❌ decisión explicada arriba |
