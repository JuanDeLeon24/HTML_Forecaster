# Plan Maestro Enterprise – HTML_FORECASTER

> Basado en la especificación Enterprise y el estado actual (v0.3.0).  
> Estrategia: **migración incremental** sobre el stack existente (Node.js + Express + SQLite + vanilla JS), sin reescritura total, para minimizar riesgo.

## Fase 0 – Auditoría y base (completada)

- [x] Auditoría técnica (`docs/AUDIT.md`).
- [x] Plan maestro (`docs/ENTERPRISE_PLAN.md`).

## Fase 1 – Robustez y datos (en curso)

Objetivo: hacer el sistema resistente a fallos de datos y de proveedor, y seguro por defecto.

- [ ] Validación obligatoria de datos (IDs, fechas, odds, probabilidades, xG) antes de persistir.
- [ ] Logger de errores estructurado en `logs/errors.log` (timestamp, API, endpoint, error, impacto).
- [ ] Autenticación opcional por token (`API_TOKEN`) para endpoints de acción.
- [ ] Proveedor de respaldo (Football-Data.org) con failover automático.
- [ ] Health check con estado del proveedor y última sincronización.
- [ ] Tests para validadores y failover.

## Fase 2 – Modelado avanzado

- [ ] xG/xGA como entrada real (modelo ponderado y ajuste de λ).
- [ ] Elo ofensivo/defensivo usado en λ.
- [ ] Ajuste de fuerzas por calidad del rival (regresión Poisson con decaimiento).
- [ ] Recalibración automática (Platt/isotónica) cuando Brier Skill caiga.
- [ ] Factor de sede en corners/tarjetas.

## Fase 3 – Machine Learning

- [ ] Exportar features a `forecasts.inputs_json` de forma estable.
- [ ] Entrenamiento walk-forward (Logistic Regression, Random Forest, Gradient Boosting).
- [ ] Meta-modelo de ensamble (stacking).
- [ ] Validación temporal y monitoreo de drift.

## Fase 4 – Infraestructura y UX

- [ ] Migraciones versionadas de BD.
- [ ] PostgreSQL opcional.
- [ ] CI/CD con tests y `npm audit`.
- [ ] Frontend: virtualización de tablas, toasts, accesibilidad.
- [ ] Observabilidad (métricas Prometheus opcionales).

## Criterios de aceptación por fase

Cada fase debe:

1. Mantener `npm test` en verde.
2. No romper la versión standalone.
3. Incluir documentación actualizada.
4. Incluir al menos un test nuevo por funcionalidad crítica.

## Riesgos

- Reescritura total a TypeScript/React descartada por coste/riesgo; se mantiene JS con tipado JSDoc opcional.
- ML requiere volumen de datos (≥ 500 partidos liquidados) para ser útil.