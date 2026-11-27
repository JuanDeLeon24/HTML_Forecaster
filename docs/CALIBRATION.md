# Calibración

1. **Métricas** (`validation/metrics.js`, `calibration/index.js`): Brier, Brier Skill, LogLoss, RPS (1X2),
   ECE (error de calibración esperado, 10 tramos), MCE (máximo) y Sharpness (media de |p − 0.5|·2).
2. **Corrección automática** por mercado (1X2, OU, BTTS, corners, tarjetas) al ejecutar el aprendizaje:
   - Candidatos: ninguna, Platt (logística sobre el logit) e Isotónica (PAV).
   - Se ajusta con el 70 % más antiguo y se evalúa en el 30 % más reciente (sin fuga de información).
   - Se adopta solo si: muestra ≥ 300, mejora media del Brier ≥ 0.0005 y ≥ 1 error estándar del diferencial pareado.
   - Validado el método, se reajusta con todos los datos disponibles y se aplica a los pronósticos futuros.
   - Se ajusta siempre sobre la probabilidad **cruda** (`raw_probability`) para no realimentar la calibración.
3. **Coherencia**: el 1X2 calibrado se renormaliza y la doble oportunidad se deriva de él. La matriz de
   marcadores (marcador exacto y combinaciones) usa las probabilidades sin calibrar: límite conocido.
