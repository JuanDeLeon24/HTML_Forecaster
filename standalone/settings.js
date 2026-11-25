/* Página «Datos y ajustes» (solo versión de archivo único). */
HF.pages.settings = (root) => {
  const S = HF.standalone;
  const c = S.config;
  const $ = (id) => document.getElementById(id);
  root.innerHTML = `
  <section><h1 class="text-xl font-bold">Datos y ajustes</h1>
    <p class="text-sm muted">Todo se ejecuta y guarda en este navegador. No se envía nada a ningún servidor salvo las consultas a Sofascore.</p></section>
  ${S.storageOk() ? '' : '<div class="warn-box">El navegador no permite guardar datos para este archivo: se perderán al cerrar la pestaña. Usa «Exportar» para conservarlos.</div>'}
  <section class="panel"><div class="panel-h"><h2>Recolector desde sofascore.com (si ves «HTTP 403»)</h2></div><div class="panel-b space-y-3 text-sm">
    <p>Sofascore rechaza con <b>HTTP 403</b> las peticiones que no salen de su propia web. Este recolector se ejecuta <b>dentro</b> de sofascore.com, descarga los datos a un archivo <code>sofascore_AAAA-MM-DD.json</code> y tú lo importas aquí. No instala nada.</p>
    <ol class="list-decimal pl-5 space-y-1">
      <li>Muestra la barra de marcadores (Ctrl+Mayús+B) y <b>arrastra</b> este botón a ella: <a id="bm" class="btn" style="cursor:grab">⚽ HF Recolector</a></li>
      <li>Abre <a href="https://www.sofascore.com" target="_blank" rel="noopener">www.sofascore.com</a> y, en esa pestaña, haz clic en el marcador «⚽ HF Recolector». Elige la fecha y espera (verás el progreso abajo a la derecha).</li>
      <li>Vuelve aquí y pulsa <b>«Importar datos (.json)»</b> en <a href="#/">Partidos del día</a>.</li>
    </ol>
    <p class="text-xs muted">Si cambias torneos o ajustes, guarda y vuelve a arrastrar el marcador (lleva la configuración dentro). Cada importación también liquida los pronósticos pendientes con los resultados de los últimos 7 días.</p>
    <details><summary class="cursor-pointer">¿No puedes crear marcadores? Usa la consola</summary>
      <p class="text-xs muted mt-2">En sofascore.com pulsa F12 → pestaña «Console», pega este código y pulsa Enter (Chrome puede pedir que escribas <code>allow pasting</code> la primera vez).</p>
      <textarea id="bm-code" readonly class="w-full text-xs mt-1" rows="4" style="font-family:monospace;background:var(--panel-2);color:var(--text);border:1px solid var(--border);border-radius:7px;padding:6px"></textarea>
      <button class="btn btn-ghost mt-1" id="bm-copy">Copiar código</button> <span id="bm-copied" class="text-xs muted"></span>
    </details>
  </div></section>
  <div class="grid lg:grid-cols-2 gap-5">
    <section class="panel"><div class="panel-h"><h2>Conexión directa con Sofascore</h2></div><div class="panel-b space-y-3 text-sm">
      <label class="block">URL base de la API<br><input id="baseUrl" class="w-full" value="${HF.esc(c.sofascore.baseUrl)}"></label>
      <div class="flex gap-2 flex-wrap"><button class="btn" id="test">Probar conexión</button><a class="btn btn-ghost" id="open" target="_blank" rel="noopener">Abrir en pestaña nueva</a></div>
      <div id="test-out" class="text-sm"></div>
      <p class="text-xs muted">Si «Probar conexión» falla pero «Abrir en pestaña nueva» muestra texto con datos, tu red llega a Sofascore y el bloqueo es del navegador (CORS) para archivos locales.</p>
    </div></section>
    <section class="panel"><div class="panel-h"><h2>Qué recolectar</h2></div><div class="panel-b space-y-3 text-sm">
      <label class="block">Torneos (IDs de Sofascore separados por coma; vacío = todos)<br><input id="tournaments" class="w-full" value="${HF.esc(c.collection.tournaments.join(','))}"></label>
      <p class="text-xs muted">17 Premier League · 8 LaLiga · 23 Serie A · 35 Bundesliga · 34 Ligue 1 · 7 Champions League · 679 Europa League · 325 Brasileirão · 155 Liga Profesional Argentina · 11621 Liga MX · 242 MLS · 1335 Copa Sudamericana · 384 Copa Libertadores</p>
      <div class="grid grid-cols-2 gap-3">
        <label>Máx. partidos por día (0 = sin límite)<br><input id="maxMatches" type="number" min="0" value="${c.collection.maxMatches}"></label>
        <label>Partidos de histórico por equipo<br><input id="historyDepth" type="number" min="5" max="50" value="${c.collection.historyDepth}"></label>
        <label>Partidos con estadísticas por equipo<br><input id="statsDepth" type="number" min="0" max="30" value="${c.collection.statsDepth}"></label>
        <label>Pausa entre peticiones (ms)<br><input id="intervalMs" type="number" min="200" value="${c.http.minIntervalMs}"></label>
      </div>
      <button class="btn" id="save">Guardar ajustes</button> <span id="save-out" class="text-xs muted"></span>
    </div></section>
  </div>
  <section class="panel"><div class="panel-h"><h2>Base de datos local</h2></div><div class="panel-b space-y-3 text-sm">
    <div id="counts" class="muted"></div>
    <div class="flex gap-2 flex-wrap">
      <button class="btn btn-ghost" id="export">Exportar (.sqlite)</button>
      <label class="btn btn-ghost" style="cursor:pointer">Importar…<input type="file" id="import" accept=".sqlite,.db" class="hidden"></label>
      <button class="btn btn-ghost" id="reset" style="color:var(--bad)">Borrar todo</button>
    </div>
    <p class="text-xs muted">Los datos viven en este navegador y para este archivo. Exporta de vez en cuando como copia de seguridad o para pasarlos a otro equipo. El archivo exportado también sirve para la versión de servidor (data/forecaster.db).</p>
  </div></section>
  <section class="panel"><div class="panel-h"><h2>Registro</h2></div><div class="panel-b"><pre id="log" class="text-xs muted" style="white-space:pre-wrap;max-height:260px;overflow:auto"></pre></div></section>`;

  const showCounts = () => HF.api('/health').then((h) => {
    const k = h.counts;
    $('counts').textContent = `${k.matches} partidos (${k.finished} terminados) · ${k.teams} equipos · ${k.stats} con estadísticas · ${k.forecasts} pronósticos · ${k.settled} predicciones liquidadas`;
    HF.refreshHealth();
  });
  const testUrl = () => `${$('baseUrl').value.replace(/\/$/, '')}/sport/football/scheduled-events/${HF.today()}`;
  $('open').href = testUrl();
  $('baseUrl').oninput = () => { $('open').href = testUrl(); };
  $('test').onclick = async () => {
    S.saveSettings({ baseUrl: $('baseUrl').value.trim().replace(/\/$/, '') });
    $('test-out').textContent = 'Probando…';
    const r = await S.testConnection();
    $('test-out').innerHTML = `<span class="${r.ok ? 'ok' : 'ko'}">${HF.esc(r.message)}</span>`;
  };
  $('save').onclick = () => {
    const num = (id) => Math.max(0, parseInt($(id).value, 10) || 0);
    S.saveSettings({
      baseUrl: $('baseUrl').value.trim().replace(/\/$/, ''),
      tournaments: $('tournaments').value.split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => Number.isFinite(x)),
      maxMatches: num('maxMatches'), historyDepth: Math.min(50, Math.max(5, num('historyDepth'))),
      statsDepth: Math.min(30, num('statsDepth')), intervalMs: Math.max(200, num('intervalMs')),
    });
    $('save-out').textContent = 'Guardado. Vuelve a arrastrar el marcador para que use estos ajustes.';
    refreshBookmarklet();
  };
  $('export').onclick = () => S.exportDb();
  $('import').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { await S.importDb(f); showCounts(); alert('Base de datos importada.'); } catch (err) { alert(`No se pudo importar: ${err.message}`); }
  };
  $('reset').onclick = async () => {
    if (!confirm('¿Borrar todos los partidos, pronósticos e historial guardados en este navegador?')) return;
    await S.resetDb(); showCounts();
  };
  const refreshBookmarklet = () => {
    const code = S.collectorCode();
    $('bm').href = `javascript:${encodeURIComponent(code)}`;
    $('bm-code').value = code;
  };
  $('bm').onclick = (e) => { e.preventDefault(); alert('Arrastra este botón a la barra de marcadores y úsalo estando en www.sofascore.com.'); };
  $('bm-copy').onclick = async () => {
    $('bm-code').select();
    try { await navigator.clipboard.writeText($('bm-code').value); } catch { document.execCommand('copy'); }
    $('bm-copied').textContent = 'Copiado.';
  };
  refreshBookmarklet();
  $('log').textContent = S.logBuffer.slice(-80).join('\n') || 'Sin actividad todavía.';
  showCounts();
};
