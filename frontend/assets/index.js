/* Dashboard principal: partidos del día + rankings Top 10 + recolección. */
HF.pages.index = (root) => {
const $ = (id) => document.getElementById(id);
const state = { date: HF.param('date') || HF.today(), matches: [], rankings: null, tab: 'confidence' };
root.innerHTML = `
  <section class="flex flex-wrap items-end gap-3">
    <div>
      <h1 class="text-xl font-bold">Partidos del día</h1>
      <p class="text-sm muted">Probabilidades basadas en datos históricos reales. Cada cifra muestra su calidad de dato.</p>
    </div>
    <div class="ml-auto flex flex-wrap items-center gap-2">
      <button class="btn btn-ghost" id="prev" aria-label="Día anterior">‹</button>
      <input type="date" id="date">
      <button class="btn btn-ghost" id="next" aria-label="Día siguiente">›</button>
      ${HF.standalone
    ? `<button class="btn btn-ghost" id="collect" title="Conexión directa: Sofascore suele rechazarla (HTTP 403)">Conexión directa</button>
      <label class="btn" style="cursor:pointer" title="Importar el archivo descargado con el recolector desde sofascore.com">Importar datos (.json)<input type="file" id="import-json" accept=".json,application/json" class="hidden"></label>`
    : '<button class="btn" id="collect">Recolectar y pronosticar</button>'}
    </div>
  </section>
  ${HF.standalone ? `<div class="panel panel-b text-sm" id="howto">
    <b>Cómo cargar datos:</b> 1) En <a href="${HF.link('settings')}">Datos y ajustes</a> arrastra el botón «⚽ HF Recolector» a la barra de marcadores (una sola vez).
    2) Abre <a href="https://www.sofascore.com" target="_blank" rel="noopener">www.sofascore.com</a> y pulsa ese marcador; descargará <code>sofascore_AAAA-MM-DD.json</code>.
    3) Vuelve aquí y pulsa <b>«Importar datos (.json)»</b>.</div>` : ''}
  <div id="job" class="hidden panel panel-b space-y-2"><div class="text-sm" id="job-label"></div><div class="progress"><div id="job-bar" style="width:0"></div></div></div>
  <section class="grid grid-cols-2 md:grid-cols-4 gap-3" id="kpis"></section>
  <section class="panel">
    <div class="panel-h"><h2>Top 10</h2><div class="tabs" id="rank-tabs"></div></div>
    <div class="scroll-x" id="rank-body"></div>
  </section>
  <section class="panel">
    <div class="panel-h"><h2>Todos los partidos</h2>
      <div class="flex gap-2 items-center"><input id="filter" placeholder="Filtrar equipo o liga" class="w-48"><label class="text-xs muted flex items-center gap-1"><input type="checkbox" id="only-fc"> solo con pronóstico</label></div>
    </div>
    <div class="scroll-x" id="matches"></div>
  </section>
  <p class="text-xs muted">Las probabilidades son estimaciones estadísticas, no certezas. El índice de confianza = probabilidad × (0.5 + 0.5 × calidad/100).</p>`;

const TABS = [
  ['confidence', 'Mayor confianza'], ['value', 'Mejor valor (EV)'], ['combinations', 'Combinaciones'],
  ['btts', 'BTTS'], ['over', 'Over 2.5'], ['under', 'Under 2.5'], ['corners', 'Corners +8.5'], ['cards', 'Tarjetas +3.5'],
];

function setDate(d) {
  state.date = d;
  $('date').value = d;
  HF.setQuery({ date: d });
  load();
}
function shift(days) {
  const d = new Date(`${state.date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  setDate(d.toISOString().slice(0, 10));
}

async function load() {
  $('matches').innerHTML = '<div class="empty">Cargando…</div>';
  try {
    const [m, r] = await Promise.all([HF.api(`/matches?date=${state.date}`), HF.api(`/rankings?date=${state.date}`)]);
    state.matches = m.matches; state.rankings = r;
    renderKpis(); renderTabs(); renderRanking(); renderMatches();
  } catch (e) {
    $('matches').innerHTML = `<div class="empty">Error: ${HF.esc(e.message)}</div>`;
  }
}

function renderKpis() {
  const fc = state.matches.filter((m) => m.forecast?.status === 'ok');
  const ins = state.matches.filter((m) => m.forecast?.status === 'insufficient').length;
  const avgQ = fc.length ? Math.round(fc.reduce((s, m) => s + m.forecast.quality.score, 0) / fc.length) : null;
  const kp = [
    ['Partidos', state.matches.length, 'en la base para esta fecha'],
    ['Pronosticados', fc.length, `${ins} con muestra insuficiente`],
    ['Calidad media', avgQ ?? '—', 'sobre 100'],
    ['Con cuotas', state.rankings?.meta.withOdds ?? 0, 'permiten calcular valor esperado'],
  ];
  $('kpis').innerHTML = kp.map(([l, v, s]) => `<div class="panel kpi"><div class="l">${l}</div><div class="v num">${v}</div><div class="text-xs muted">${s}</div></div>`).join('');
}

function renderTabs() {
  $('rank-tabs').innerHTML = TABS.map(([k, l]) => `<button data-k="${k}" class="${state.tab === k ? 'active' : ''}">${l}</button>`).join('');
  $('rank-tabs').querySelectorAll('button').forEach((b) => { b.onclick = () => { state.tab = b.dataset.k; renderTabs(); renderRanking(); }; });
}

function renderRanking() {
  const list = state.rankings?.[state.tab] || [];
  if (!list.length) {
    const msg = state.tab === 'value' ? 'No hay cuotas registradas con valor esperado positivo para esta fecha.' : `Sin pronósticos para esta fecha. Pulsa “Recolectar y pronosticar”${HF.standalone ? ' o importa los datos descargados desde sofascore.com (ver «Datos y ajustes»)' : ''}.`;
    $('rank-body').innerHTML = `<div class="empty">${msg}</div>`;
    return;
  }
  const extraH = state.tab === 'value' ? '<th>Cuota</th><th>EV</th><th>¼ Kelly</th>' : state.tab === 'combinations' ? '<th>Riesgo</th><th>Cuota justa</th>' : '';
  $('rank-body').innerHTML = `<table class="t"><thead><tr><th>#</th><th>Partido</th><th>Selección</th><th>Prob.</th><th>Confianza</th>${extraH}<th>Dato</th></tr></thead><tbody>${list.map((r, i) => `
    <tr><td class="num muted">${i + 1}</td>
      <td><a href="${HF.link('analysis', { id: r.matchId })}">${HF.esc(r.match)}</a><div class="text-xs muted">${HF.esc(r.tournament || '')} · ${HF.time(r.startTime)}</div></td>
      <td>${HF.esc(r.label)}${r.assumptions?.length ? `<div class="text-xs muted">${HF.esc(r.assumptions.join(' '))}</div>` : ''}</td>
      <td class="num" style="min-width:90px">${HF.pct(r.probability, 1)}${HF.pbar(r.probability)}</td>
      <td class="num font-semibold">${HF.pct(r.confidence, 1)}</td>
      ${state.tab === 'value' ? `<td class="num">${HF.n(r.odds)}</td><td class="num ok">+${HF.pct(r.ev, 1)}</td><td class="num">${HF.pct(r.kellyQuarter, 1)}</td>` : ''}
      ${state.tab === 'combinations' ? `<td>${HF.esc(r.risk)}</td><td class="num">${HF.n(r.fairOdds)}</td>` : ''}
      <td>${HF.qBadge(r.quality, r.qualityScore)}</td></tr>`).join('')}</tbody></table>`;
}

function renderMatches() {
  const q = $('filter').value.trim().toLowerCase();
  const only = $('only-fc').checked;
  const rows = state.matches.filter((m) => (!q || `${m.home} ${m.away} ${m.tournament}`.toLowerCase().includes(q)) && (!only || m.forecast?.status === 'ok'));
  if (!rows.length) {
    $('matches').innerHTML = `<div class="empty">${state.matches.length ? 'Ningún partido coincide con el filtro.' : 'No hay partidos guardados para esta fecha. Pulsa “Recolectar y pronosticar” para descargarlos.'}</div>`;
    return;
  }
  $('matches').innerHTML = `<table class="t"><thead><tr><th>Hora</th><th>Partido</th><th>1 · X · 2</th><th>λ goles</th><th>O2.5</th><th>BTTS</th><th>Pick</th><th>Dato</th></tr></thead><tbody>${rows.map((m) => {
    const f = m.forecast;
    const score = m.homeGoals !== null ? `<span class="font-semibold num">${m.homeGoals}-${m.awayGoals}</span>` : '';
    let cells;
    if (!f) cells = '<td colspan="5" class="muted text-xs">Sin pronóstico (partido ya iniciado o datos no recolectados)</td><td></td>';
    else if (f.status !== 'ok') cells = `<td colspan="5" class="text-xs" style="color:var(--warn)">${HF.esc(f.reason)}</td><td>${HF.qBadge(f.quality.grade, f.quality.score)}</td>`;
    else cells = `<td>${HF.bar3(f.p1X2)}<div class="text-xs muted num mt-1">${HF.pct(f.p1X2[1])} · ${HF.pct(f.p1X2.X)} · ${HF.pct(f.p1X2[2])}</div></td>
      <td class="num text-xs">${HF.n(f.lambdas.home)} – ${HF.n(f.lambdas.away)}</td>
      <td class="num">${HF.pct(f.over25)}</td><td class="num">${HF.pct(f.btts)}</td>
      <td class="text-xs">${f.pick ? `${HF.esc(f.pick.label)} <b class="num">${HF.pct(f.pick.probability)}</b>` : '—'}</td>
      <td>${HF.qBadge(f.quality.grade, f.quality.score)}</td>`;
    return `<tr><td class="num">${HF.time(m.startTime)}<div class="text-xs muted">${HF.esc(m.status)}</div></td>
      <td><a href="${HF.link('analysis', { id: m.id })}">${HF.esc(m.home)} vs ${HF.esc(m.away)}</a> ${score}<div class="text-xs muted">${HF.esc(m.category ? m.category + ' · ' : '')}${HF.esc(m.tournament || '')}</div></td>${cells}</tr>`;
  }).join('')}</tbody></table>`;
}

async function collect() {
  $('collect').disabled = true;
  $('job').classList.remove('hidden');
  $('job-label').textContent = 'Iniciando recolección…';
  try {
    const { job } = await HF.api('/collect', { method: 'POST', body: JSON.stringify({ date: state.date }) });
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      const j = await HF.api(`/jobs/${job.id}`);
      if (j.progress) {
        $('job-label').textContent = `Recolectando ${j.progress.done}/${j.progress.total}: ${j.progress.label}`;
        $('job-bar').style.width = `${(j.progress.done / j.progress.total) * 100}%`;
      }
      if (j.status === 'done') {
        const c = j.result.collected; const f = j.result.forecasted;
        HF.refreshHealth();
        $('job-label').textContent = `Listo: ${c.matches} partidos, ${c.teams} equipos, ${c.statsFetched} estadísticas nuevas, ${c.errors.length} errores · ${f.forecasted} pronósticos, ${f.insufficient} con muestra insuficiente.`;
        break;
      }
      if (j.status === 'error') { $('job-label').textContent = `Error: ${j.error}`; break; }
    }
  } catch (e) {
    $('job-label').textContent = `Error: ${e.message}`;
  }
  $('collect').disabled = false;
  load();
}

$('date').onchange = (e) => setDate(e.target.value);
$('prev').onclick = () => shift(-1);
$('next').onclick = () => shift(1);
$('collect').onclick = collect;
if (HF.standalone) $('import-json').onchange = (e) => importJson(e.target.files[0]);

async function importJson(file) {
  if (!file) return;
  $('job').classList.remove('hidden');
  $('job-label').textContent = 'Importando…';
  try {
    const r = await HF.standalone.importSofascore(file, (p) => {
      $('job-label').textContent = p.total ? `Procesando ${p.done}/${p.total}: ${p.label}` : p.label;
      if (p.total) $('job-bar').style.width = `${(p.done / p.total) * 100}%`;
    });
    const c = r.collected; const f = r.forecasted; const s = r.settled;
    $('job-label').textContent = `Importado ${r.date}: ${c.matches} partidos, ${c.teams} equipos, ${c.statsFetched} estadísticas · ${f.forecasted} pronósticos (${f.insufficient} con muestra insuficiente, ${f.skippedStarted} ya iniciados) · ${s.predictions} predicciones liquidadas${c.errors.length ? ` · ${c.errors.length} avisos` : ''}.`;
    const dg = c.diagnostics;
    if (!c.matches && dg) {
      $('job-label').innerHTML = dg.eventsThatDay
        ? `El archivo tiene ${dg.eventsThatDay} partidos el ${HF.esc(r.date)}, pero ninguno de tus torneos (${HF.esc(dg.tournaments.join(', ') || 'todos')}). Torneos que juegan ese día: ${dg.available.map((t) => `<b>${t.id}</b> ${HF.esc(t.name)} (${t.n})`).join(' · ')}. Añade los que quieras en <a href="${HF.link('settings')}">Datos y ajustes → Torneos</a>, guarda, vuelve a arrastrar el marcador y repite la descarga.`
        : `El archivo no contiene partidos del ${HF.esc(r.date)}. Comprueba la fecha elegida en el recolector.`;
    }
    HF.refreshHealth();
    if (r.date !== state.date) { setDate(r.date); return; }
  } catch (e) {
    $('job-label').textContent = `Error: ${e.message}`;
  }
  load();
}
$('filter').oninput = renderMatches;
$('only-fc').onchange = renderMatches;
setDate(state.date);
};
