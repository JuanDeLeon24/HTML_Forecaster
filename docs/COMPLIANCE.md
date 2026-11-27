# Cumplimiento – HTML_FORECASTER

| Área | Estado | Notas |
|---|---|---|
| Sin fuga de información | ✅ | `teamHistory`, `h2hHistory`, `goalBaseline` filtran por `start_time < ref`. |
| Sin datos inventados | ✅ | Proveedor devuelve `null`/`[]` cuando no hay dato. |
| Trazabilidad | ✅ | `forecasts`, `predictions`, `model_params_history`. |
| Aprendizaje validado | 🟡 | Pesos/ρ con encogimiento; falta validación temporal completa (etapa 5). |
| Calibración | 🟡 | ECE/MCE/sharpness básicos; falta isotónica/Platt real (etapa 5). |
| Seguridad | 🟡 | Token opcional añadido; falta comparación en tiempo constante y rate limit por IP. |
| Cobertura de tests | 🟡 | 18 pruebas; objetivo 90% (etapa 9). |
| Proveedores de respaldo | ❌ | Estructura de failover lista; falta implementar un segundo proveedor real. |