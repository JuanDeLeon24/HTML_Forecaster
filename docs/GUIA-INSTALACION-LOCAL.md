# Guía paso a paso: HTML_FORECASTER funcionando solo en tu PC

Objetivo: abrir la herramienta en el navegador y que **ella sola** descargue los partidos, pronostique,
liquide resultados y aprenda. Sin marcadores, sin archivos `.json`, sin importar nada.

Tiempo estimado: 20–30 minutos la primera vez. Después: doble clic en un archivo.

> Esta guía es para un PC donde **sí puedes instalar programas** (tu PC personal).
> En el PC de la empresa sigue usando el archivo único `HTML_Forecaster.html`.

---

## Paso 1 · Instalar Node.js (el motor que ejecuta la herramienta)

1. Abre https://nodejs.org
2. Descarga la versión marcada como **LTS** (24 o superior). Archivo `.msi` para Windows.
3. Ejecuta el instalador: Siguiente → acepta la licencia → Siguiente en todo → Instalar → Finalizar.
   No marques nada extra.
4. **Cierra todas las ventanas de PowerShell** que tuvieras abiertas.
5. Comprueba: pulsa la tecla Windows, escribe `PowerShell`, ábrelo y escribe:

   ```powershell
   node -v
   ```

   Debe mostrar algo como `v24.x.x`. **Si muestra un número menor que 22.13**, desinstala Node desde
   «Agregar o quitar programas» e instala la LTS actual: la base de datos integrada lo necesita.

## Paso 2 · Copia de seguridad de tu carpeta actual

Tu carpeta `C:\Users\sebas\OneDrive\Escritorio\HTML_Forecaster` tiene cambios tuyos. **No la borres.**

1. En el Explorador de archivos, clic derecho sobre la carpeta → **Cambiar nombre** →
   `HTML_Forecaster_mis_cambios`.

## Paso 3 · Descargar la última versión (v0.4)

1. Abre este enlace en el navegador (descarga un `.zip`):

   https://github.com/JuanDeLeon24/HTML_Forecaster/archive/refs/heads/unificacion-v0.6.zip

2. Ve a **Descargas**, clic derecho en el `.zip` → **Extraer todo…**
3. Como destino escribe `C:\` y pulsa **Extraer**.
4. Se crea una carpeta con un nombre largo (`HTML_Forecaster-unificacion-v0.6`).
   Cámbiale el nombre a **`HTML_Forecaster`**. Debe quedar en `C:\HTML_Forecaster`.

   > ¿Por qué `C:\` y no el Escritorio? El Escritorio está dentro de OneDrive, que intenta sincronizar
   > miles de archivos internos (`node_modules`) y hace todo lento o lo bloquea.

## Paso 4 · Instalar las dependencias

1. Abre PowerShell y escribe, **una línea cada vez** (pulsa Enter después de cada una):

   ```powershell
   cd C:\HTML_Forecaster
   ```

   ```powershell
   npm.cmd install
   ```

2. Espera a que termine (1–2 minutos). Es normal ver avisos amarillos (`WARN`).
3. Si aparece un error que dice **«la ejecución de scripts está deshabilitada»**, es porque escribiste `npm`
   en vez de `npm.cmd`. Usa siempre `npm.cmd` en esta guía.

## Paso 5 · Configuración

1. Escribe:

   ```powershell
   Copy-Item .env.example .env
   ```

   ```powershell
   notepad .env
   ```

2. En el Bloc de notas, cambia estas líneas (deja las demás igual):

   ```text
   TIMEZONE=America/Bogota
   TOURNAMENTS=17,18,8,35,23,34,7,679,17015
   SCHEDULER_ENABLED=1
   ```

   - `TIMEZONE`: tu zona horaria (define a qué día pertenece cada partido).
   - `TOURNAMENTS`: Premier, Championship, LaLiga, Bundesliga, Serie A, Ligue 1, Champions, Europa League
     y Conference League. Quita los que no quieras.
   - `SCHEDULER_ENABLED=1`: mientras la herramienta esté abierta, cada mañana hace sola el ciclo completo
     y cada 3 horas liquida resultados y reaprende.

   **Si usas football-data.org** (porque Sofascore devuelve 403), cambia también:

   ```text
   DATA_PROVIDER=football-data
   FOOTBALL_DATA_API_KEY=tu_clave
   FOOTBALL_DATA_COMPETITIONS=2021,2016,2014,2002,2019,2015,2001
   ```

   La clave es gratuita: https://www.football-data.org/client/register (llega al correo). Ojo: ese plan
   solo da resultados y calendario; sin corners, tarjetas, cuotas ni xG.

3. Guarda (Ctrl+G) y cierra el Bloc de notas.

## Paso 6 · Comprobar que todo funciona

```powershell
npm.cmd test
```

Al final debe decir `# pass 38` y `# fail 0`. Si algo falla, copia el texto y envíamelo.

## Paso 7 · Crear el acceso directo «Abrir HTML_FORECASTER»

1. Escribe:

   ```powershell
   notepad C:\HTML_Forecaster\Abrir_HTML_Forecaster.bat
   ```

   Si pregunta si quieres crear el archivo, pulsa **Sí**.
2. Pega exactamente esto:

   ```bat
   @echo off
   cd /d C:\HTML_Forecaster
   start "" http://localhost:3000
   npm.cmd start
   ```

3. Guarda y cierra.
4. Clic derecho en el archivo `C:\HTML_Forecaster\Abrir_HTML_Forecaster.bat` → **Enviar a** →
   **Escritorio (crear acceso directo)**.

## Paso 7b · Cargar el histórico completo (una sola vez)

```powershell
npm.cmd run bootstrap
```

Descarga las temporadas completas (actual y anterior) de tus competiciones. Tarda unos minutos
(football-data permite 10 peticiones por minuto). Sin este paso cada equipo tiene muy pocos partidos y
los pronósticos salen con calidad C/D. Si se te olvida, la herramienta lo hace sola en el ciclo diario
o te muestra el botón «Cargar histórico completo».

## Paso 8 · Primer análisis

1. Doble clic en el acceso directo del Escritorio. Se abre una ventana negra (**no la cierres**: es la
   herramienta funcionando) y el navegador en `http://localhost:3000`. Si el navegador dice «no se puede
   acceder», espera 3 segundos y pulsa F5.
2. Pulsa **«Recolectar y pronosticar»**. Verás una barra de progreso. La primera vez tarda varios minutos
   porque descarga el histórico de cada equipo. Las siguientes son mucho más rápidas.
3. Al terminar verás los partidos del día, el Top 10, la confianza A+…D y las apuestas de valor.
4. **Si aparece «HTTP 403»:** Sofascore también bloquea este método desde tu conexión. No intentes nada más
   y envíame el texto exacto del error (lo resolvemos con otra fuente de datos).

## Paso 9 · Uso diario (sin hacer nada)

- Con la ventana negra abierta, cada mañana a partir de las 06:00 la herramienta:
  1. descarga los resultados de los partidos pronosticados y los liquida;
  2. reaprende (calibración, pesos, logística) aplicando las reglas de seguridad;
  3. descarga los partidos del día y los pronostica;
  4. hace una copia de seguridad en `C:\HTML_Forecaster\storage\backups`.
- Tú solo abres `http://localhost:3000` (o el acceso directo) y miras.
- Para cerrar la herramienta: cierra la ventana negra.

### Opcional: que se haga aunque no abras la herramienta

1. Crea `C:\HTML_Forecaster\Diario.bat` con el Bloc de notas (igual que en el paso 7) y este contenido:

   ```bat
   @echo off
   cd /d C:\HTML_Forecaster
   call npm.cmd run daily >> logs\diario.log 2>&1
   ```

2. Pulsa la tecla Windows, escribe **Programador de tareas** y ábrelo.
3. A la derecha: **Crear tarea básica…**
   - Nombre: `HTML_Forecaster diario` → Siguiente.
   - Desencadenador: **Diariamente** → Siguiente → hora `06:30` → Siguiente.
   - Acción: **Iniciar un programa** → Siguiente → **Examinar** → elige `C:\HTML_Forecaster\Diario.bat`
     → Siguiente → Finalizar.
4. Para probarla ya: en la lista de tareas, clic derecho en `HTML_Forecaster diario` → **Ejecutar**.
   El resultado queda en `C:\HTML_Forecaster\logs\diario.log`.

## Paso 10 · Dónde mirar si algo va mal

| Qué | Dónde |
|---|---|
| Errores (fecha, origen, endpoint, error, impacto) | `C:\HTML_Forecaster\logs\errors.log` |
| Todo lo que hace la herramienta | `C:\HTML_Forecaster\logs\system.log` |
| Cada pronóstico emitido | `C:\HTML_Forecaster\logs\predictions.log` |
| Estado general | en PowerShell: `cd C:\HTML_Forecaster` y luego `npm.cmd run health` |
| Copias de seguridad | `C:\HTML_Forecaster\storage\backups` (diarias, semanales, mensuales) |

## Paso 11 · Tus cambios anteriores

Tus modificaciones siguen en `HTML_Forecaster_mis_cambios` (paso 2). Para integrarlas en esta versión sin
perder nada: comprime esa carpeta (clic derecho → Enviar a → Carpeta comprimida), **sin** la subcarpeta
`node_modules` si existe, y adjúntala en el chat. Las reviso e integro.

## Preguntas frecuentes

- **¿Puedo usarlo desde el móvil?** Solo en la misma red y con ajustes extra; por defecto solo desde ese PC.
- **¿Se puede romper algo?** La base tiene copias automáticas. Si se daña, la herramienta restaura sola la
  última copia válida al arrancar.
- **¿Cómo actualizo a una versión nueva?** Repite el paso 3 en una carpeta nueva y copia dentro tu archivo
  `.env` y la carpeta `data` (ahí están tus datos).
