# HTML_FORECASTER

Plataforma web para analizar partidos de fútbol con datos históricos reales y modelos estadísticos
(Poisson + Dixon-Coles, Elo y un modelo ponderado). Genera probabilidades, rankings Top 10 y
combinaciones, guarda cada pronóstico, lo compara con el resultado real y ajusta sus propios
parámetros con esa evidencia.

> Las probabilidades son estimaciones estadísticas, no certezas. El sistema **nunca inventa datos**:
> si no hay muestra suficiente, no emite pronóstico y lo indica.

## Versión de archivo único (sin instalar nada)

Descarga [`dist/HTML_Forecaster.html`](dist/HTML_Forecaster.html) y ábrelo con doble clic en Chrome,
Edge o Firefox. Incluye el motor completo (modelos, validación, aprendizaje), SQLite en WebAssembly y
los gráficos; los datos se guardan en el propio navegador (exportables desde «Datos y ajustes»).
Solo necesita acceso a internet hacia `api.sofascore.com`. Si el navegador o la red lo bloquean,
«Datos y ajustes → Probar conexión» lo diagnostica.

Para regenerarlo tras cambiar el código: `npm run build:standalone`.

## Inicio rápido (servidor)

Requisitos: **Node.js ≥ 22.5** (usa el módulo nativo `node:sqlite`, sin compilar nada).

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm start
```

En **Windows PowerShell 5** no existe `&&` ni `cp`: ejecuta cada comando por separado y copia el
archivo de configuración con:

```powershell
Copy-Item .env.example .env
```

Abre http://127.0.0.1:3000 y pulsa **«Recolectar y pronosticar»**. También por CLI:

```bash
npm run collect -- --date 2026-11-30
```

```bash
npm run settle
```

```bash
npm run daily
```

| Comando | Qué hace |
|---|---|
| `npm run collect -- --date D` | Descarga partidos de D, histórico, estadísticas, H2H, clasificaciones y cuotas; luego pronostica |
| `npm run forecast -- --date D` | Recalcula pronósticos con los datos ya guardados (sin red) |
| `npm run settle` | Descarga resultados de partidos terminados y liquida las predicciones |
| `npm run learn` | Reajusta pesos del ensamble y ρ de Dixon-Coles con predicciones liquidadas |
| `npm run daily` | settle → learn → collect → forecast (ideal para un cron diario) |
| `npm test` | Pruebas (modelos, validación, calibración, walk-forward, backtesting, API y pipeline completo) |
| `npm run coverage` | Pruebas con informe de cobertura |
| `npm run backup` / `npm run health` | Copia de seguridad manual / estado de la base y últimos errores |
| `npm run bootstrap` | Carga temporadas completas de tus competiciones (histórico inicial) |
| `npm run report` / `npm run test-provider` | Resumen de datos en `docs/DATOS-OBTENIDOS.md` / prueba de conexión con el proveedor |

**Primera recolección:** con todos los torneos del día puede haber cientos de partidos y miles de
peticiones. Para empezar, limita con `TOURNAMENTS=17,8,23,35,34` (Premier, LaLiga, Serie A,
Bundesliga, Ligue 1) o `MAX_MATCHES=30` en `.env`. Las estadísticas de partidos terminados se
guardan una sola vez, así que las ejecuciones siguientes son mucho más rápidas.

## Páginas

- **Partidos del día** (`/`): todos los partidos con 1X2, λ de goles, Over 2.5, BTTS, pick y calidad del dato; Top 10 por confianza, valor esperado, combinaciones, BTTS, Over, Under, corners y tarjetas.
- **Análisis** (`/analysis?id=…`): 1X2 por modelo, todos los mercados, mapa de marcadores, explicación «¿por qué?», perfiles 5/10/20/50, H2H, calidad del dato, valor frente a cuotas, combinador de eventos y, tras el partido, «¿por qué falló?».
- **Rendimiento** (`/stats`): Brier, Brier Skill, Log Loss, Accuracy, Precision, Recall, F1, RPS, ROI virtual, calibración y parámetros aprendidos.
- **Historial** (`/history`): filtros por fecha, competición y equipo; pronóstico, resultado y acierto.

Modo claro/oscuro y diseño responsive.

## Fuente de datos

Por defecto, la API JSON no oficial de Sofascore (los mismos endpoints que envuelve
[apdmatos/sofascore-api](https://github.com/apdmatos/sofascore-api)). No es una API pública
garantizada: puede cambiar o bloquear peticiones automatizadas. Úsala con fines personales,
con el ritmo por defecto (`REQUEST_INTERVAL_MS=450`) o más lento. La arquitectura permite añadir
API-Football, Football-Data, etc. sin tocar el núcleo (ver `docs/ARCHITECTURE.md`).

## Documentación

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): capas, flujo de datos y cómo añadir proveedores
- [docs/MODELS.md](docs/MODELS.md): matemáticas de cada modelo, calidad del dato y métricas
- [docs/API.md](docs/API.md): endpoints REST
- [docs/ROADMAP.md](docs/ROADMAP.md): estado de las versiones v0.1 → v2.0
- [docs/UNIFICACION-v0.6.md](docs/UNIFICACION-v0.6.md): qué se unificó de v0.4 y v0.5 y qué se descartó
- [docs/AUDIT.md](docs/AUDIT.md): auditoría de la v0.3
- [docs/COMPLIANCE.md](docs/COMPLIANCE.md): cumplimiento de la especificación Enterprise, punto por punto
- [docs/DATABASE.md](docs/DATABASE.md) y [docs/CALIBRATION.md](docs/CALIBRATION.md)
