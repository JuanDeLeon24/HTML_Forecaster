# PROMPT 1 · Plan de desarrollo paso a paso de HTML_FORECASTER

> **Cómo usar este documento (para cualquier persona)**
>
> 1. Abre Claude Code en la carpeta del proyecto (app de escritorio → nueva sesión → elegir la carpeta
>    `HTML_Forecaster`, o en una terminal: `cd` a la carpeta y escribir `claude`).
> 2. Copia **todo** el bloque que empieza en «INICIO DEL PROMPT» y termina en «FIN DEL PROMPT» y pégalo.
> 3. Claude trabajará **una etapa cada vez** y se detendrá al final de cada una con un informe. Lee el
>    informe, comprueba los «Criterios de aceptación» y responde `continúa` para pasar a la siguiente,
>    o pide correcciones.
> 4. No hace falta saber programar: en cada etapa se indica qué comprobar en pantalla.
> 5. Si una etapa se interrumpe, pega de nuevo el prompt y escribe: `retoma desde la etapa N`.

---

## INICIO DEL PROMPT

Actúa como un equipo formado por: arquitecto de software senior, ingeniero full-stack, científico de datos
especializado en fútbol, estadístico de modelos probabilísticos, ingeniero de machine learning, analista
profesional de apuestas, ingeniero QA y especialista en sistemas predictivos.

Vas a continuar el desarrollo de **HTML_FORECASTER**, una plataforma local de análisis y predicción
probabilística de fútbol. Trabaja **por etapas**. Al terminar CADA etapa:
- ejecuta las pruebas (`npm test`) y, si cambiaste la interfaz, regenera el archivo único
  (`npm run build:standalone`);
- haz un commit con un mensaje claro;
- entrégame un informe con: qué hiciste, archivos tocados, resultado de pruebas, qué comprobar en pantalla,
  riesgos y qué queda pendiente;
- **detente y espera** mi respuesta `continúa`.

### 0. Contexto obligatorio (léelo antes de tocar nada)

**Repositorio:** https://github.com/JuanDeLeon24/HTML_Forecaster. La rama de trabajo más reciente es
`claude/clever-meitner-8ir4tc` (versión 0.4.0). Trabaja en una rama nueva `desarrollo-v0.5` creada a partir
de ella. Nunca hagas push a `main` ni fuerces (`--force`) ninguna rama.

**Restricciones que NO se pueden romper:**
1. El usuario usa la herramienta en un PC de empresa donde **no puede instalar nada**. La forma de uso real es
   `dist/HTML_Forecaster.html`, un único archivo que se abre con doble clic. Todo cambio debe seguir funcionando
   ahí. El servidor Node (`npm start`) es secundario.
2. Sofascore devuelve **HTTP 403** a peticiones que no salen de su web. Los datos se obtienen con el marcador
   «⚽ HF Recolector» (`standalone/bookmarklet.src.js`), que se ejecuta dentro de sofascore.com, descarga
   `sofascore_AAAA-MM-DD.json` y se importa con «Importar datos (.json)». Este flujo no se puede romper.
   Si cambias rutas de la API en el proveedor, cambia también el recolector: deben pedir **exactamente** las
   mismas rutas (el importador responde desde la caché del archivo).
3. **Nunca inventar datos**: ni estadísticas, ni resultados, ni cuotas, ni datos de demostración en la
   aplicación. Los datos sintéticos solo se permiten dentro de `tests/`.
4. **Cero fuga de información**: un pronóstico solo usa partidos terminados ANTES del inicio del partido; solo
   se pronostican partidos no iniciados; ningún parámetro se ajusta con datos posteriores al periodo que evalúa.
5. Todo parámetro aprendido debe validarse fuera de muestra (validación temporal) antes de adoptarse, y la
   decisión debe quedar registrada en `ml_training_history`.
6. No migrar a TypeScript/React/Vite/Docker salvo que el usuario lo pida explícitamente.
7. Todo el SQL vive en `backend/database/repositories.js`; los cambios de esquema necesitan migración en
   `backend/database/migrations.js` (la base del navegador de versiones anteriores debe actualizarse sola).

**Mapa del código (v0.4):**
| Carpeta | Contenido |
|---|---|
| `backend/providers/` | Contrato canónico `BaseProvider`, cliente y mapper de Sofascore, registro de proveedores |
| `backend/collectors/` | Partidos del día, histórico por equipo, estadísticas, H2H, clasificaciones, resultados |
| `backend/validators/` | Validación de partidos, estadísticas, cuotas y salidas de pronóstico |
| `backend/database/` | `schema.sql`, `migrations.js`, `repositories.js`, `db.js` (node:sqlite) |
| `backend/analyzers/` | Perfil de equipo (ventanas, sede, bayesiano, xG, fatiga), H2H, goles, corners, tarjetas, valor |
| `backend/models/` | Poisson + Dixon-Coles, bivariado, Elo (global/ofensivo/defensivo/local/visitante), ponderado, logística |
| `backend/engine/` | `forecast.js` (orquestación), confianza, valor, ranking, combinaciones, calidad, explicación, mercados |
| `backend/calibration/` | Isotónica, Platt, ECE/MCE/sharpness, elección validada del método |
| `backend/learning/` | Walk-forward (expanding/rolling), aprendizaje de pesos, logística, calibración, ρ, deriva |
| `backend/backtesting/`, `backend/validation/` | Backtesting, métricas, monitoreo, liquidación, análisis de fallos |
| `backend/routes/` | `handlers.js` (lógica de API compartida por servidor y archivo único), `api.js` (Express, token, límites) |
| `frontend/assets/` | Páginas `HF.pages.*` (index, analysis, value, stats, history) y `common.js` |
| `standalone/` | Archivo único: `main.js`, `config.js`, `db.js` (sql.js + IndexedDB), `cachedHttp.js`, `settings.js`, `bookmarklet.src.js` |
| `scripts/` | `build-standalone.js`, copias de seguridad, chequeo de salud |
| `tests/` | Pruebas `node:test` (unitarias, integración API, pipeline con proveedor sintético) |
| `docs/` | Arquitectura, modelos, API, base de datos, calibración, cumplimiento (`COMPLIANCE.md`), roadmap |

**Comandos:** `npm install` · `npm test` · `npm run coverage` · `npm run build:standalone` · `npm start`.
Requiere Node.js ≥ 22.5. Si no está instalado en este equipo, dímelo y no marques nada como verificado.

### Etapa 1 · Puesta en marcha y línea base
1. Ejecuta `git status`, `git log --oneline -5` y `git branch -a`. Crea la rama `desarrollo-v0.5`.
2. Ejecuta `npm install`, `npm test`, `npm run coverage` y `npm run build:standalone`. Guarda los resultados
   (número de pruebas, cobertura de líneas y ramas, tamaño del HTML).
3. Lee `docs/COMPLIANCE.md` y resume en una tabla qué está ✅, 🟡 y ❌.
4. Crea `docs/BASELINE.md` con esos resultados: es la referencia para detectar regresiones.

**Criterios de aceptación:** todas las pruebas pasan; existe `docs/BASELINE.md`; `dist/HTML_Forecaster.html`
abre con doble clic y muestra «Partidos del día».

### Etapa 2 · Corrección de métricas (prioridad máxima: un modelo no se puede mejorar si se mide mal)
1. **Doble conteo de selecciones complementarias.** Hoy se guardan como filas binarias independientes
   1/X/2, 1X/X2/12, over/under de la misma línea y BTTS sí/no. Las métricas globales («overall») cuentan el
   mismo evento varias veces e inflan n. Corrige:
   - métricas globales y de calibración: una sola fila por evento (p. ej. solo `over` en OU, solo `yes` en
     BTTS) más el 1X2 evaluado como multiclase (Brier multiclase, RPS, LogLoss);
   - DC y TEAM_OU: decide si se evalúan aparte o se excluyen del agregado global, y documenta la decisión;
   - mantén las métricas por mercado y explica en la interfaz qué incluye cada número.
2. **ROI vs. Yield.** En `validation/metrics.js` la función `roi()` devuelve beneficio/apuestas (eso es
   *yield*). Renómbralo correctamente en todo el código y en la interfaz: Yield = beneficio / total apostado;
   ROI = beneficio / banca inicial (configurable, no 100 fijo).
3. **Precision/Recall/F1** solo tienen sentido para eventos «sí/no»; documenta en la interfaz el umbral (0.5) y
   que se calculan sobre la selección evaluada.
4. **ECE/MCE**: añade también la versión con tramos de igual frecuencia (cuantiles), además de los 10 tramos fijos.
5. Añade intervalos de confianza (bootstrap, 1000 remuestreos, semilla fija) para Brier, LogLoss y Yield. Muestra
   «Brier 0.212 [0.205–0.219]».
6. Pruebas: crea casos con resultados conocidos que verifiquen cada métrica a mano (incluye el caso de doble conteo).

**Criterios:** el número de «predicciones liquidadas» de la página de calibración coincide con el número de
eventos, no de filas; las pruebas nuevas pasan; `docs/CALIBRATION.md` actualizado.

### Etapa 3 · Calidad y cobertura de datos
1. **Fuerza del rival (Strength of Schedule).** Hoy ataque y defensa no se ajustan por la calidad del rival.
   Implementa un ajuste iterativo (o regresión Poisson con efectos de ataque/defensa por equipo y decaimiento
   temporal) usando solo partidos anteriores al de referencia. Valida fuera de muestra contra la versión actual
   y adopta solo si mejora (regla del proyecto).
2. **Sesgo del pool de normalización.** La media de goles se calcula con los partidos que hay en la base, que son
   los de los equipos recolectados. Documenta el sesgo y, si es posible, usa la clasificación del torneo
   (goles a favor/en contra de todos los equipos) como pool alternativo.
3. **Alineaciones, ausencias y árbitro:** investiga en Sofascore los endpoints `/event/{id}/lineups` (incluye
   jugadores ausentes) y el árbitro del evento. Añádelos al proveedor, al mapper, al validador, a la base
   (con migración) y al recolector por marcador (mismas rutas). Por ahora solo guárdalos y muéstralos; no los
   uses en el modelo hasta tener muestra para validar su efecto.
4. **Cuotas de apertura y cierre:** guarda cada captura de cuotas con su fecha (no sobrescribir) para poder
   medir el movimiento de mercado y el CLV (closing line value).
5. **Recolector:** añade una opción para descargar varios días seguidos (rango de fechas) y un resumen final
   (partidos, peticiones, errores). Mantén el límite de ritmo.

**Criterios:** migraciones probadas sobre una base de la versión anterior; el recolector y el proveedor piden las
mismas rutas (añade una prueba que lo compruebe); sin datos inventados.

### Etapa 4 · Modelos
1. **Dixon-Coles completo:** estima ataque, defensa, ventaja local y ρ por máxima verosimilitud con
   decaimiento temporal (ξ), como en el artículo original; compáralo con el método actual (Maher +
   encogimiento) con validación expanding-window.
2. **Elo:** ajusta K y ventaja local por validación temporal (no a ojo). Usa el Elo local/visitante como
   característica de la regresión logística.
3. **Cadenas de Markov:** solo si hay datos de minutos de gol suficientes (incidencias). Si no, documéntalo como
   pendiente con el motivo.
4. **Machine learning de árboles** (Random Forest, Gradient Boosting): implementar SOLO si hay ≥ 2000 partidos
   liquidados. En navegador puede hacerse en JavaScript puro (árboles pequeños) o entrenarse fuera y exportar el
   modelo como JSON. Siempre con validación temporal, sin barajar los datos.
5. Cada modelo nuevo entra al ensamble con peso 0 y solo recibe peso si el aprendizaje lo valida.

**Criterios:** el comparador de modelos de la página de análisis muestra los modelos nuevos; las pruebas
verifican que las probabilidades suman 1 y que no se usan datos posteriores.

### Etapa 5 · Calibración y aprendizaje
1. Calibración del 1X2 como multiclase (por ejemplo, escalado de temperatura o Dirichlet) además de la binaria.
2. Que la matriz de marcadores y las combinaciones usen probabilidades coherentes con la calibración (hoy usan
   la matriz sin calibrar: límite documentado en `docs/CALIBRATION.md`).
3. El aprendizaje debe ejecutarse solo tras liquidar resultados y mostrar en la interfaz la próxima acción
   («faltan 42 partidos para poder ajustar pesos»).
4. Revisa los umbrales (60 partidos para pesos, 200 para logística, 300 por mercado para calibración) con una
   simulación: ¿con cuántos partidos el ajuste deja de ser ruido? Documenta el resultado.

### Etapa 6 · Valor y gestión de riesgo
1. Probabilidad implícita sin margen también para Doble Oportunidad (derivada del 1X2 sin margen).
2. Exposición máxima por día y por partido (suma de stakes), configurable.
3. Correlación: no recomendar a la vez dos selecciones fuertemente correlacionadas del mismo partido.
4. CLV (closing line value) en el backtesting cuando haya cuota de cierre.

### Etapa 7 · Interfaz y reportes
1. Exportar reportes en CSV (predicciones, valor, backtesting) y un informe imprimible (PDF vía impresión del
   navegador) desde el archivo único.
2. Página de ayuda con el flujo completo (marcador → importar → liquidar → reaprender) y glosario de métricas.
3. Accesibilidad: contraste AA, navegación con teclado, textos alternativos en gráficos.
4. Revisión en móvil (390 px de ancho) sin desplazamiento horizontal de la página.

### Etapa 8 · Robustez y operación
1. Archivo único: guardar en IndexedDB también durante la recolección (no solo al final) y avisar antes de
   cerrar la pestaña si hay una tarea en curso.
2. Comprobar si los datos del navegador se conservan al mover el HTML a otra carpeta (el origen `file://`
   puede cambiar según el navegador). Documentar y ofrecer exportar/importar.
3. Límite de memoria de sql.js con bases grandes: medir con 50 000 partidos y proponer limpieza de datos antiguos.
4. Servidor: limpieza periódica del mapa del limitador de peticiones; comparación del token en tiempo constante.

### Etapa 9 · Pruebas y cierre
1. Cobertura ≥ 90 % de líneas en `backend/` y pruebas de regresión que fijen métricas con un conjunto sintético
   de referencia (si un cambio altera el Brier de referencia, la prueba debe avisar).
2. Pruebas de extremo a extremo del archivo único con Playwright (si está disponible) usando una API simulada.
3. Actualiza `docs/COMPLIANCE.md`, `docs/MODELS.md`, `README.md` y el número de versión (0.5.0).
4. Sube la rama `desarrollo-v0.5` y entrega el informe final: cambios, pruebas, cobertura, pendientes y riesgos.

## FIN DEL PROMPT
