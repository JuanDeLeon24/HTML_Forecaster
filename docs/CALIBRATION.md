# Calibración

Métricas implementadas: Brier, Log Loss, RPS, ECE, MCE, sharpness (`backend/calibration/`).

Pendiente (etapas 5/6):
- Isotonic Regression real (PAVA).
- Platt scaling (regresión logística).
- Calibración multiclase (temperatura/Dirichlet).
- Coherencia de la matriz de marcadores con probabilidades calibradas.
- Intervalos de confianza por bootstrap.

Límite documentado: hoy la matriz de marcadores y las combinaciones usan la matriz sin calibrar.