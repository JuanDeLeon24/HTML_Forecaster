# Roadmap

| Versión | Contenido | Estado |
|---|---|---|
| v0.1 | Partidos del día, histórico, dashboard, Top 10 | ✅ |
| v0.2 | Corners, tarjetas, BTTS, Over/Under | ✅ |
| v0.3 | Seguimiento de aciertos, historial (pronóstico, resultado, error, precisión acumulada) | ✅ |
| v1.0 | Poisson + Dixon-Coles, Elo, ranking por confianza y valor, métricas, calibración (medición) | ✅ base implementada |
| v2.0 | Autoevaluación y ajuste automático de pesos | ✅ ensamble y ρ · ⏳ ML |

## Pendiente

**Modelado**
- Ajustar las fuerzas por calidad del rival (regresión Poisson / Dixon-Coles completo por MV con decaimiento temporal).
- Recalibración automática (isotónica / Platt) cuando la curva de calibración se desvíe.
- xG/xGA como entrada (Sofascore los expone en estadísticas de muchas ligas; ya se guardan).
- Machine Learning: Random Forest, XGBoost, LightGBM, CatBoost sobre las features guardadas en `forecasts.inputs_json`, con validación temporal (walk-forward).

**Fase 3 – contexto**: lesiones y suspensiones (alineaciones), árbitro, clima, viajes, fatiga, noticias.

**Infraestructura**: PostgreSQL, autenticación, Docker, CI con `npm test`, proveedores adicionales (API-Football, Football-Data, Understat, FBref).
