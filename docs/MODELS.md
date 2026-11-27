# Modelos y métricas

Todos los cálculos usan solo partidos terminados **antes** del inicio del partido a pronosticar.

## Perfil del equipo (`analyzers/teamForm.js`)
Ventanas de 5, 10, 20 y 50 partidos y por sede: G-E-P, puntos/partido, goles a favor/en contra,
BTTS, Over 1.5/2.5/3.5, porterías a cero, corners y tarjetas a favor/en contra (con su `n`).

**Fuerzas (Maher):** con μ = goles medios por equipo y partido del pool (torneo si tiene ≥ 40
partidos en 400 días; si no, global) y h = √(media local / media visitante):

- goles anotados ajustados por sede (en casa ÷ h, fuera × h), ponderados por decaimiento temporal
  (vida media 180 días) y encogidos hacia μ con k = 3 partidos ficticios:
  `ataque = (Σ w·g + k·μ) / (Σ w + k) / μ`. Igual para la defensa con goles recibidos.

## Nivel 1 — Modelo ponderado (`models/weighted.js`)
`S = 0.35·Forma + 0.20·H2H + 0.10·Localía + 0.20·Ataque + 0.15·Defensa`, cada componente en [−1, 1].
Logit ordenado: `P(1) = σ(a·S − c)`, `P(2) = σ(−a·S − c)`, `P(X)` = resto, con `c = ln((1+d)/(1−d))`
para que con S = 0 el empate sea la tasa base d. Es heurístico: su peso en el ensamble lo decide el
aprendizaje.

## Nivel 2 — Elo (`models/elo.js`)
World Football Elo: K = 20 × multiplicador por diferencia de goles, ventaja local 65.
1X2: `E = 1/(1+10^(−(ΔR+65)/400))`; empate con campana centrada en partidos parejos y altura igual a
la tasa de empates observada. **Elo ofensivo/defensivo**: goles esperados `= base·10^((atk−def)/400)`,
actualizados con K·(goles − esperados). Solo se usa si ambos equipos tienen ≥ 5 partidos en la base.

## Niveles 3 y 4 — Poisson + Dixon-Coles (`models/poisson.js`, `analyzers/goals.js`)
`λL = μ·AtqL·DefV·h`, `λV = μ·AtqV·DefL/h`; el total se mezcla con la media de goles del H2H
(peso ≤ 15 %, encogido por tamaño de muestra). Matriz 0–10 × 0–10 con corrección τ de Dixon-Coles
(ρ por defecto −0.08; aprendido por máxima verosimilitud cuando hay ≥ 150 partidos liquidados).

## Ensamble y coherencia
`1X2 final = Σ wₘ·Pₘ` (por defecto Poisson 0.5, Elo 0.25, Ponderado 0.25). La matriz de marcadores se
reescala región a región (victoria local / empate / victoria visitante) para que su 1X2 coincida con
el ensamble; **todos** los mercados de goles (O/U, BTTS, doble oportunidad, marcador exacto,
combinaciones) se derivan de esa matriz y son coherentes entre sí.

## Corners y tarjetas (`analyzers/countModel.js`)
`E[local] = (a favor local + en contra visitante)/2`, ídem visitante; el total se mezcla con el H2H
(≤ 20 %). Si la varianza observada supera a la media se usa **Binomial Negativa**
(r = m²/(var − m)); si no, Poisson. Requiere ≥ 3 partidos con estadísticas por equipo; si no, el
mercado no se pronostica. Tarjetas = amarillas + rojas (árbitro aún no modelado).

## Combinaciones (`engine/combinations.js`)
Legs de goles: probabilidad conjunta **exacta** sumando las celdas de la matriz que cumplen todos los
predicados (captura correlaciones como «gana local + over 2.5»). Corners/tarjetas: independencia
(supuesto declarado). Se reporta conjunta, producto ingenuo, *lift*, riesgo y cuota justa.

## Calidad del dato y confianza (`engine/quality.js`)
Puntuación 0–100: muestra de goles 45, cobertura de estadísticas 20, H2H 10, frescura 15, pool 10 →
A ≥ 80, B ≥ 60, C ≥ 40, D. Sin pronóstico si algún equipo tiene < 5 partidos.
**Índice de confianza** = p × (0.5 + 0.5 × calidad/100).

## Valor esperado (`analyzers/valuebets.js`)
`EV = p·cuota − 1`; probabilidad implícita sin margen; ¼ de Kelly como referencia de riesgo.

## Métricas (`validation/metrics.js`)
Brier, Brier Skill Score, Log Loss, Accuracy/Precision/Recall/F1 (umbral 0.5), RPS y Brier
multiclase del 1X2, calibración en 10 tramos, ROI virtual (picks con cuota real).

## Aprendizaje (`learning/weights.js`)
- Pesos del ensamble: rejilla sobre el símplex (paso 0.05) minimizando el Brier del 1X2 con ≥ 30
  partidos; `w = α·w_opt + (1−α)·w_def`, α = n/(n+200).
- ρ: MV condicional sobre los λ guardados, α = n/(n+300).

## Análisis de fallos (`validation/failureAnalysis.js`)
Con datos registrados únicamente: expulsiones (minuto, equipo, jugador), penales fallados, goles
tempranos, xG vs goles (varianza de definición), xG vs goles esperados (perfil distinto).
Lesiones y rotaciones requieren alineaciones (Fase 3).

## Modelos añadidos en v0.4
- **Poisson clásico** (sin corrección) y **bivariado** (Karlis-Ntzoufras, λ3 = 0.1 por defecto) como referencia en el comparador.
- **xG/xGA**: misma estructura multiplicativa que Poisson usando goles esperados (mín. 5 partidos con xG por equipo).
- **Bayesiano**: las fuerzas son la media posterior Gamma-Poisson; se publica también su desviación típica.
- **Elo local/visitante**: ratings separados por sede.
- **Regresión logística multinomial** sobre características previas al partido; entra al ensamble solo si supera a Dixon-Coles en validación temporal.
- **Ensamble**: Dixon-Coles, Elo, Ponderado, xG y Logística. Pesos aprendidos con validación expanding-window y reglas de no-cambio (muestra, varianza, sobreajuste, deriva).
- **Confianza 0–100** (`engine/confidence.js`) y **valor** (`engine/valueBets.js`): ver docs/COMPLIANCE.md.
- **Explicabilidad**: ablación (se neutraliza cada factor y se mide el cambio en la probabilidad del favorito).

## Limitaciones conocidas
- Las fuerzas no se ajustan todavía por la calidad del rival (lo compensa en parte el Elo).
- El Elo se calcula con los partidos presentes en la base: equipos de ligas sin conexión entre sí
  no son comparables hasta acumular partidos internacionales/copas.
- Sin árbitro, clima, lesiones ni fatiga (Fase 3).
