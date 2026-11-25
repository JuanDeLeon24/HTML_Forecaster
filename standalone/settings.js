/* Página «Datos y ajustes» (solo versión de archivo único). */
HF.pages.settings = (root) => {
  const S = HF.standalone;
  const c = S.config;
  const $ = (id) => document.getElementById(id);
  root.innerHTML = `
  <section><h1 class="text-xl font-bold">Datos y ajustes</h1>
    <p class="text-sm muted">Todo se ejecuta y guarda en este navegador. No se envía nada a ningún servidor salvo las consultas a Sofascore.</p></section>
  ${S.storageOk() ? '' : '<div class="warn-box">El navegador no permite guardar datos para este archivo: se perderán al cerrar la pestaña. Usa «Exportar» para conservarlos.</div>'}
  <div class="grid lg:grid-cols-2 gap-5">
    <section class="panel"><div class="panel-h"><h2>Conexión con Sofascore</h2></div><div class="panel-b space-y-3 text-sm">
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
    $('save-out').textContent = 'Guardado.';
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
  $('log').textContent = S.logBuffer.slice(-80).join('\n') || 'Sin actividad todavía.';
  showCounts();
};
