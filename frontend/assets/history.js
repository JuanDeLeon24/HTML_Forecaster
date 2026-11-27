/* Historial con filtros (fecha, competición, equipo). */
HF.pages.history = (root) => {
const $ = (id) => document.getElementById(id);
let teams = [];
root.innerHTML = `
  <section class="flex flex-wrap items-end gap-3">
    <div><h1 class="text-xl font-bold">Historial de predicciones</h1><p class="text-sm muted">Pronóstico, resultado real y nivel de acierto de cada partido.</p></div>
    <div class="ml-auto flex flex-wrap items-center gap-2 text-sm">
      <label>Desde <input type="date" id="from"></label>
      <label>Hasta <input type="date" id="to"></label>
      <select id="tournament"><option value="">Todas las competiciones</option></select>
      <input id="team" placeholder="Equipo" list="teams" class="w-40"><datalist id="teams"></datalist>
      <button class="btn" id="apply">Aplicar</button>
      <button class="btn btn-ghost" id="export">Exportar CSV</button>
    </div>
  </section>
  <section class="panel panel-b" id="tbl"><div class="empty">Cargando…</div></section>`;

async function load() {
  const q = new URLSearchParams();
  for (const k of ['from', 'to', 'tournament']) if ($(k).value) q.set(k, $(k).value);
  const t = teams.find((x) => x.name === $('team').value);
  if (t) q.set('team', t.id);
  const r = await HF.api(`/history?${q}`);
  const sel = $('tournament');
  if (sel.options.length === 1) r.tournaments.forEach((x) => sel.add(new Option(x.name, x.id)));
  const rows = r.items.map((i) => ({
    text: `${i.match} ${i.tournament || ''} ${i.pick?.label || ''} ${i.causes.map((c) => c.text).join(' ')}`,
    sort: [i.startTime, i.match, i.pick?.probability ?? -1, i.score ?? '', i.pick?.outcome ?? -1, i.hitRate ?? -1, i.causes.length],
    cells: [
      `<span class="num">${HF.dateTime(i.startTime)}</span>`,
      `<a href="${HF.link('analysis', { id: i.matchId })}">${HF.esc(i.match)}</a><div class="text-xs muted">${HF.esc(i.tournament || '')}</div>`,
      i.pick ? `${HF.esc(i.pick.label)} <span class="num muted">${HF.pct(i.pick.probability)}</span>` : '<span class="muted">—</span>',
      i.score ?? `<span class="muted">${HF.esc(i.status)}</span>`,
      i.pick ? HF.outcome(i.pick.outcome, i.pick.void) : '—',
      i.hitRate === null ? '—' : `${HF.pct(i.hitRate)} <span class="text-xs muted">(${i.graded})</span>`,
      i.causes.length ? `<span class="text-xs">${i.causes.map((c) => HF.esc(c.text)).join('<br>')}</span>` : '',
    ],
  }));
  HF.table($('tbl'), {
    columns: ['Fecha', 'Partido', 'Pick principal', 'Resultado', 'Pick', 'Acierto ≥50%', 'Causas detectadas'],
    rows, empty: 'Aún no hay pronósticos guardados.',
  });
}

$('team').oninput = async (e) => {
  if (e.target.value.length < 2) return;
  teams = await HF.api(`/teams?q=${encodeURIComponent(e.target.value)}`);
  $('teams').innerHTML = teams.map((t) => `<option value="${HF.esc(t.name)}">`).join('');
};
$('apply').onclick = () => load().catch((e) => { $('tbl').innerHTML = `<div class="empty">Error: ${HF.esc(e.message)}</div>`; });
$('export').onclick = async () => {
  const r = await HF.api('/export?type=history');
  const blob = new Blob([r.csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'history.csv'; a.click();
};
load().catch((e) => { $('tbl').innerHTML = `<div class="empty">Error: ${HF.esc(e.message)}</div>`; });
};
