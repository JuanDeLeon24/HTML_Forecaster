/* Historial con filtros (fecha, competición, equipo) y DataTables. */
(() => {
HF.header('history');
const $ = (id) => document.getElementById(id);
let table = null;
let teams = [];

async function load() {
  const q = new URLSearchParams();
  for (const k of ['from', 'to', 'tournament']) if ($(k).value) q.set(k, $(k).value);
  const t = teams.find((x) => x.name === $('team').value);
  if (t) q.set('team', t.id);
  const r = await HF.api(`/history?${q}`);
  const sel = $('tournament');
  if (sel.options.length === 1) r.tournaments.forEach((x) => sel.add(new Option(x.name, x.id)));
  const rows = r.items.map((i) => [
    i.startTime, `<a href="/analysis?id=${encodeURIComponent(i.matchId)}">${HF.esc(i.match)}</a><div class="text-xs muted">${HF.esc(i.tournament || '')}</div>`,
    i.pick ? `${HF.esc(i.pick.label)} <span class="num muted">${HF.pct(i.pick.probability)}</span>` : '<span class="muted">—</span>',
    i.score ?? `<span class="muted">${HF.esc(i.status)}</span>`,
    i.pick ? HF.outcome(i.pick.outcome, i.pick.void) : '—',
    i.hitRate === null ? '—' : `${HF.pct(i.hitRate)} <span class="text-xs muted">(${i.graded})</span>`,
    i.causes.length ? `<span class="text-xs">${i.causes.map((c) => HF.esc(c.text)).join('<br>')}</span>` : '',
  ]);
  if (table) { table.clear(); table.rows.add(rows).draw(); return; }
  table = new DataTable('#tbl', {
    data: rows, order: [[0, 'desc']], pageLength: 25,
    columns: [
      { title: 'Fecha', render: (d, type) => (type === 'display' ? HF.dateTime(d) : d) },
      { title: 'Partido' }, { title: 'Pick principal' }, { title: 'Resultado' }, { title: 'Pick' },
      { title: 'Acierto ≥50%' }, { title: 'Causas detectadas' },
    ],
    language: { search: 'Buscar:', lengthMenu: 'Mostrar _MENU_', info: '_START_–_END_ de _TOTAL_', infoEmpty: 'Sin registros', emptyTable: 'Aún no hay pronósticos guardados.', zeroRecords: 'Sin coincidencias', paginate: { previous: '‹', next: '›' } },
  });
}

$('team').oninput = async (e) => {
  if (e.target.value.length < 2) return;
  teams = await HF.api(`/teams?q=${encodeURIComponent(e.target.value)}`);
  $('teams').innerHTML = teams.map((t) => `<option value="${HF.esc(t.name)}">`).join('');
};
$('apply').onclick = () => load().catch((e) => alert(e.message));
load().catch((e) => { $('tbl').outerHTML = `<div class="empty">Error: ${HF.esc(e.message)}</div>`; });
})();
