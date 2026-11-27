# PROMPT 2 · Auditoría completa de HTML_FORECASTER (errores, bugs, métricas, datos, seguridad)

> **Cómo usar este documento**
>
> 1. Abre Claude Code en la carpeta del proyecto.
> 2. Pega todo el bloque entre «INICIO DEL PROMPT» y «FIN DEL PROMPT».
> 3. La auditoría **no modifica el código** salvo para añadir pruebas que demuestren un fallo y el informe final.
>    Al terminar entrega `docs/AUDITORIA.md` y un resumen en el chat.
> 4. Después, si quieres que se corrijan los hallazgos, escribe: `corrige los hallazgos críticos y altos, uno por
>    commit, con su prueba`.

---

## INICIO DEL PROMPT

Actúa como un equipo de auditoría independiente: auditor de software senior, ingeniero QA, estadístico
especializado en evaluación de modelos probabilísticos, científico de datos deportivos, analista de riesgo de
apuestas e ingeniero de seguridad. Tu trabajo es **encontrar problemas, no justificarlos**. Sé escéptico:
toda afirmación del código o de la documentación debe verificarse leyendo el código y, cuando sea posible,
ejecutándolo.

### Reglas de la auditoría
1. **No modifiques el código de producción.** Solo puedes:
   - crear pruebas nuevas en `tests/audit/` que demuestren un fallo (pueden fallar: es la evidencia);
   - crear scripts de verificación en `scripts/audit/`;
   - escribir el informe `docs/AUDITORIA.md`.
2. Trabaja en una rama nueva `auditoria` creada desde `claude/clever-meitner-8ir4tc`. No hagas push a otras ramas.
3. Cada hallazgo debe tener: **ID** (A-001…), **severidad** (Crítica / Alta / Media / Baja / Informativa),
   **categoría**, **archivo:línea**, **descripción**, **cómo reproducirlo** (entrada concreta → resultado incorrecto),
   **impacto** (qué decisión o número queda mal), **evidencia** (prueba o salida de comando) y **corrección propuesta**.
4. Distingue **confirmado** (lo reprodujiste) de **probable** (razonado pero no reproducido). No infles la lista
   con opiniones de estilo.
5. Severidad: *Crítica* = probabilidades, métricas o recomendaciones de valor incorrectas sin aviso, fuga de
   información, pérdida de datos. *Alta* = resultado incorrecto en casos frecuentes. *Media* = casos poco
   frecuentes o degradación. *Baja* = robustez/claridad. *Informativa* = mejora.
6. Requiere Node.js ≥ 22.5: ejecuta `npm install`, `npm test`, `npm run coverage` y `npm run build:standalone`.
   Si algo no se puede ejecutar, dilo explícitamente en el informe.

### Contexto del sistema
HTML_FORECASTER pronostica partidos de fútbol con: Poisson clásico, Poisson bivariado, Dixon-Coles, Elo
(global, ofensivo, defensivo, local, visitante), modelo ponderado, xG/xGA, actualización bayesiana Gamma-Poisson
y regresión logística, combinados en un ensamble. Calibra por mercado (Platt/isotónica), calcula un score de
confianza 0–100 (A+…D), detecta apuestas de valor (edge, EV, Kelly), hace backtesting y aprende pesos con
validación temporal. Funciona como servidor Node (`npm start`) y como archivo único
(`dist/HTML_Forecaster.html`, sql.js + IndexedDB). Los datos vienen de Sofascore mediante un marcador que se
ejecuta en sofascore.com (`standalone/bookmarklet.src.js`) y un importador (`standalone/cachedHttp.js`).
Lee `docs/ARCHITECTURE.md`, `docs/MODELS.md`, `docs/CALIBRATION.md`, `docs/DATABASE.md` y `docs/COMPLIANCE.md` antes de empezar.

### Fase 1 · Inventario
- Lista todos los archivos, su responsabilidad y quién los llama. Dibuja (texto) el flujo:
  recolector → importación → validación → base → perfiles → modelos → ensamble → calibración → confianza →
  valor → guardado → liquidación → métricas → aprendizaje.
- Ejecuta pruebas y cobertura; anota qué archivos o ramas no tienen cobertura.

### Fase 2 · Fuga de información y sesgos (máxima prioridad)
Verifica con pruebas concretas:
1. `repositories.teamHistory`, `h2hHistory`, `goalBaseline`, `xgBaseline`, `allFinishedMatches`: ¿filtran por
   `start_time < referencia` en TODOS los casos? ¿Puede colarse un partido terminado después del inicio del
   partido pronosticado?
2. Elo: se calcula con partidos anteriores al inicio del DÍA. ¿Hay partidos del mismo día que terminan antes del
   inicio de otro partido y no se usan (pérdida) o que se usan cuando no deberían (fuga)?
3. Clasificaciones (`standings`) y cuotas: ¿son la foto del momento de la recolección? Si se re-pronostica un
   partido más tarde, ¿la clasificación incluye resultados posteriores?
4. `runForecasts` solo pronostica partidos no iniciados: ¿qué pasa si el reloj del PC está mal o el estado del
   proveedor está desactualizado?
5. Aprendizaje (`learning/weights.js`, `calibration/index.js`, `learning/walkForward.js`): ¿los cortes son
   estrictamente cronológicos? ¿se usa la probabilidad cruda (`raw_probability`) para ajustar la calibración?
   ¿el reajuste final con todos los datos es correcto? ¿hay *look-ahead* en la detección de deriva?
6. Regresión logística: ¿la estandarización usa solo datos de entrenamiento? ¿las características se calcularon
   antes del partido?
7. Sesgo de selección: el pool de normalización contiene solo partidos de equipos recolectados. Cuantifica el efecto.
8. Re-pronósticos: al re-pronosticar, ¿se anulan bien las predicciones anteriores y no quedan duplicadas en las métricas?

### Fase 3 · Corrección matemática de los modelos
Para cada uno, compara contra cálculo independiente (script propio o valores publicados):
1. Poisson y Dixon-Coles: suma 1, τ correcto, límites de ρ, efecto del truncado en 10 goles.
2. Bivariado: fórmula de Karlis-Ntzoufras, conservación de medias, caso λ3 = 0.
3. Reescalado de la matriz al 1X2 del ensamble (`rescaleMatrix`): ¿preserva coherencia? ¿qué pasa con regiones de probabilidad 0?
4. Elo: fórmula esperada, multiplicador por goles, simetría (suma de cambios = 0), conversión a 1X2 y modelo de empate.
5. Modelo ponderado: logit ordenado, empate base, rango de componentes, efecto de `zero` (ablación).
6. xG: normalización, factor local, mínimo de muestra, qué pasa si xG es 0.
7. Bayesiano: media y desviación posteriores Gamma-Poisson con pesos fraccionarios.
8. Corners/tarjetas: elección Poisson vs. binomial negativa, estimación de la dispersión (¿la varianza mezcla
   equipos distintos?), conteo de tarjetas (¿doble amarilla cuenta doble?).
9. Combinaciones: probabilidad conjunta exacta con la matriz vs. independencia para corners/tarjetas;
   coherencia con las probabilidades calibradas.
10. Explicabilidad por ablación: ¿la suma de aportes tiene sentido? ¿«Descanso» solo actúa si hay logística? ¿se comunica bien?

### Fase 4 · Métricas y evaluación (crítico)
1. **Doble conteo:** se guardan filas complementarias (1/X/2, over/under, sí/no, DC). Comprueba si `fullReport`
   y la página «Calibración y backtesting» cuentan el mismo evento varias veces y cuánto cambia el Brier/ECE.
2. **ROI vs. Yield:** revisa `validation/metrics.js` (`roi()`), `monitoring()` y la interfaz. ¿Los nombres coinciden
   con las definiciones? ¿Hay una banca de 100 fija?
3. Brier, LogLoss (recorte en ε), Brier Skill, RPS (orden 1 < X < 2), ECE, MCE, sharpness, precision/recall/F1:
   verifica cada fórmula con ejemplos a mano.
4. Calibración por tramos: tramos vacíos, último tramo (p = 1), número mínimo por tramo.
5. Backtesting: drawdown, curva de capital (orden temporal), apuestas sin cuota, stake 0 de descartadas,
   estrategias por modelo (¿se elige la mejor selección con información del resultado?).
6. Significancia: ¿se reportan intervalos de confianza? ¿Con qué n un Yield es distinguible de 0?
7. Score de confianza: ¿los factores están en la escala correcta? ¿El ranking por índice favorece mercados triviales?

### Fase 5 · Apuestas de valor y riesgo
- Probabilidad implícita sin margen: ¿correcta en mercados de 2 y 3 vías? ¿Doble Oportunidad usa la implícita
  con margen (sesgo del edge)?
- Kelly y Kelly fraccional, tope de stake, exposición total por día y por partido.
- Descartes: mercado mal calibrado, margen alto, confianza baja. ¿Se aplican siempre? ¿Se pueden saltar?
- ¿Se recomiendan selecciones correlacionadas del mismo partido?
- ¿Las cuotas usadas son de la misma captura que el pronóstico?

### Fase 6 · Datos, proveedor y recolector
1. Mapper de Sofascore: marcador a 90' (`normaltime`), estados (aplazado, cancelado, abandonado, interrumpido),
   claves de estadísticas, rojas ausentes = 0, cuotas fraccionarias.
2. Validadores: casos límite (posesión que no suma 100, tiros al arco > tiros, xG negativo, fechas futuras,
   mismo equipo local y visitante). ¿Se registra el error con origen, endpoint e impacto?
3. Recolector por marcador vs. proveedor: genera la lista de rutas que pide cada uno para un mismo día simulado y
   compruébalas; cualquier diferencia es un hallazgo (el importador fallaría o guardaría vacíos).
4. Importador (`cachedHttp.js`): rutas ausentes, `/event/{id}` reconstruido, estado desactualizado de un evento.
5. Zona horaria: partidos cerca de medianoche, cambio de horario, PC en otra zona distinta a la del recolector.
6. Duplicados de partidos entre proveedores o entre recolecciones.

### Fase 7 · Base de datos y persistencia
- Migraciones sobre una base creada con la versión inicial (commit `2b16682`): ¿se actualiza sin perder datos?
- Índices y rendimiento con 50 000 partidos (genera datos sintéticos en un script de auditoría).
- Archivo único: ¿cuándo se guarda en IndexedDB? ¿Se pierde algo si se cierra la pestaña durante la importación?
  ¿Los datos siguen visibles si se mueve el HTML de carpeta? ¿Límite de memoria de sql.js?
- Servidor: copias de seguridad (rotación, restauración automática ante base dañada: pruébala corrompiendo una copia).

### Fase 8 · Seguridad
- XSS: todo texto externo (nombres de equipos, torneos, jugadores, mensajes de error) se escapa con `HF.esc`
  antes de insertarse en HTML. Revisa cada `innerHTML` de `frontend/assets/*.js` y `standalone/settings.js`.
- El marcador se ejecuta en sofascore.com: ¿puede filtrar algo? ¿Usa `eval` o carga código externo?
- Servidor: escucha en 127.0.0.1, token opcional (¿comparación en tiempo constante?), límite de peticiones
  (¿crece el mapa sin límite?), tamaño máximo del cuerpo, inyección SQL (¿todos los valores van parametrizados?
  revisa especialmente el `LIMIT` construido con texto y `VACUUM INTO`).
- Dependencias: `npm audit`.

### Fase 9 · Interfaz
- Las cifras mostradas coinciden con la API (compara 3 partidos a mano).
- Estados vacíos, errores de red, modo oscuro/claro, móvil (390 px), teclado.
- Textos que prometen algo que el código no hace.

### Fase 10 · Rendimiento
- Tiempo por pronóstico (objetivo < 500 ms), por día completo y de carga inicial del HTML (objetivo < 2 s).
- Coste del grid search del aprendizaje con 5 modelos y 3000 partidos.

### Entregable: `docs/AUDITORIA.md`
1. **Resumen ejecutivo**: estado general, los 5 hallazgos más graves y si los números del sistema son fiables hoy.
2. **Tabla de hallazgos** ordenada por severidad: ID, severidad, categoría, archivo:línea, título, confirmado/probable.
3. **Detalle de cada hallazgo** con el formato de las reglas (incluye la prueba de `tests/audit/` que lo demuestra).
4. **Verificación de métricas**: tabla «métrica · fórmula esperada · fórmula en el código · ¿correcta?».
5. **Verificación de fuga de información**: cada punto de la Fase 2 con resultado.
6. **Cobertura y pruebas**: resultado de `npm test` y `npm run coverage`, zonas sin cobertura.
7. **Plan de corrección priorizado**: orden recomendado, esfuerzo estimado (S/M/L) y dependencias.
8. **Lo que no se pudo verificar** y por qué.

Al terminar, haz commit de `docs/AUDITORIA.md`, `tests/audit/` y `scripts/audit/` en la rama `auditoria`, súbela
y muéstrame el resumen ejecutivo y la tabla de hallazgos en el chat.

## FIN DEL PROMPT
