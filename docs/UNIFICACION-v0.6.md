# Unificación v0.6 (v0.4 + desarrollo-v0.5)

Había dos versiones paralelas: `claude/clever-meitner-8ir4tc` (v0.4) y `desarrollo-v0.5` (creada desde una versión
anterior a la v0.4). La v0.6 parte de la v0.4 e incorpora lo valioso de la v0.5, corrigiendo sus errores.

## Incorporado desde la v0.5
| Pieza | Cambios al integrarla |
|---|---|
| Proveedor **football-data.org** | Usa sus propios IDs de competición (`FOOTBALL_DATA_COMPETITIONS`), ya no los de Sofascore; respeta 10 peticiones/min. |
| Proveedor **API-Football** | Incidencias sin repetir la petición del partido (ahorra la mitad del cupo diario de 100); respeta el ritmo. |
| **Respaldo automático** (`FALLBACK_PROVIDER`) | Registra en el log cada cambio de proveedor. |
| **WhatsApp** (Meta / Twilio) | Mensaje con nivel de confianza A+…D y apuestas de valor; botón en el panel y envío automático opcional tras el ciclo diario. |
| **En vivo** | Reescrito: ya no usa reglas fijas («7 corners → over»), sino Poisson sobre el tiempo restante a partir de los goles esperados del pronóstico. Se detiene la actualización al salir de la página. |
| **Métricas sin doble conteo** (`primaryRows`) | Las métricas globales, la calibración y el monitoreo usan una fila por evento. |
| Intervalos de confianza (bootstrap) y calibración por cuantiles | Mostrados en «Calibración y backtesting». |
| **Yield vs. ROI** | Yield = beneficio/apostado; ROI = beneficio/banca configurable (antes eran el mismo número). |
| **Doble Oportunidad sin margen** | El edge en DC ya no está inflado. |
| **Exposición diaria y correlación** | Máx. 5 apuestas/día y 15 % de la banca; en un mismo partido solo la mejor selección por familia. |
| Exportación CSV | Predicciones y apuestas de valor, también desde el archivo único. |
| ρ de Dixon-Coles en [−0.2, 0] | Hallazgo H-17 de tu auditoría. |
| `--include-started`, token en tiempo constante, limpieza del limitador | Hallazgos H-05, H-02/H-11 de tu auditoría. |
| Documentos | `AUDIT.md`, `ENTERPRISE_PLAN.md`, `DATOS-OBTENIDOS.md`, `BASELINE.md`, `Abrir_HTML_Forecaster.bat`, `scripts/generate-data-report.js`, `scripts/test-provider.js`. |

## Nuevo en la v0.6
- **Carga inicial del histórico** (`npm run bootstrap`, botón «Cargar histórico completo» y automática en el
  ciclo diario si hay menos de 500 partidos terminados): temporadas completas (actual + anterior) de cada
  competición en ~2 peticiones por competición. Resuelve el problema principal de tus datos (5 partidos por
  equipo, calidad C/D).

## NO incorporado (y por qué)
| Pieza de la v0.5 | Motivo |
|---|---|
| `models/bivariate.js` | Error matemático: sumaba 0.25 a cada equipo y omitía el factor (λ1·λ2)^k; con λ 1.40/1.10 daba 1.79/1.49 goles. Se mantiene `bivariatePoisson.js` (v0.4, conserva medias). |
| `models/tree.js` | Probabilidades fijas escritas a mano (62 %/18 %…), sin entrenamiento: viola «nunca reglas arbitrarias». |
| `learning/weights.js` (v0.5) | Ajustaba y adoptaba pesos con los mismos datos, sin validación temporal ni reglas de no-cambio. Se mantiene el de la v0.4. |
| `calibration/*` (v0.5) | Dirichlet era un marcador de posición y nada se aplicaba a los pronósticos. Se mantiene la v0.4 (se aplica solo si mejora fuera de muestra). |
| `models/logistic.js` binario, `markov.js`, `bayesian.js` sueltos | No los usaba el pronóstico. La v0.4 tiene logística multiclase y bayesiano integrados. Markov queda pendiente (sin datos minuto a minuto). |
| `engine/live.js` con reglas fijas | Reescrito con base estadística. |
| Playwright e2e | Requiere descargar navegadores; el archivo único se verifica con la batería de pruebas y en navegador. |

## Qué hacer en tu PC
1. Descarga esta rama (enlace en la guía) en `C:\HTML_Forecaster` conservando tu `.env` y tu carpeta `data`.
2. En `.env` revisa `DATA_PROVIDER`, tu `FOOTBALL_DATA_API_KEY` y que las competiciones usen IDs de ese proveedor.
3. `npm.cmd install` → `npm.cmd test` (38 pruebas) → `npm.cmd run bootstrap` → abrir la herramienta.
