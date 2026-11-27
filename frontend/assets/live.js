/* Partidos en vivo: actualización periódica y recomendaciones en tiempo real. */
HF.pages.live = (root) => {
  const $ = (id) => document.getElementById(id);
  let timer = null;
  root.innerHTML = `
  <section class="flex flex-wrap items-end gap-3">
    <div><h1 class="text-xl font-bold">En vivo</h1><p class="text-sm muted">Partidos en curso, estadísticas en tiempo real y recomendaciones.</p></div>
    <div class="ml-auto flex items-center gap-2">
      <label class="text-sm">Fecha <input type="date" id="date"></label>
      <button class="btn btn-ghost" id="refresh">Actualizar ahora</button>
      <span id="status" class="text-xs muted"></span>
    </div>
  </section>
  <section class="panel"><div class="scroll-x" id="live-body"><div class="empty">Cargando…</div></div></section>`;

  const state = { date: HF.param('date') || HF.today() };

  async function load() {
    $('date').value = state.date;
    $('live-body').innerHTML = '<div class="empty">Actualizando…</div>';
    try {
      const r = await HF.api(`/live?date=${state.date}`);
      render(r);
      $('status').textContent = `${r.count} en vivo · actualizado ${new Date().toLocaleTimeString()}`;
    } catch (e) {
      $('live-body').innerHTML = `<div class="empty">Error: ${HF.esc(e.message)}</div>`;
    }
  }

  function render(r) {
    if (!r.matches.length) { $('live-body').innerHTML = '<div class="empty">No hay partidos en vivo para esta fecha.</div>'; return; }
    $('live-body').innerHTML = `<table class="t"><thead><tr><th>Partido</th><th>Marcador</th><th>Min</th><th>Corners</th><th>Tarjetas</th><th>Recomendaciones</th></tr></thead><tbody>${r.matches.map((x) => {
      const m = x.match;
      const L = x.live;
      return `<tr>
        <td><a href="${HF.link('analysis', { id: m.id })}">${HF.esc(m.home_name)} vs ${HF.esc(m.away_name)}</a><div class="text-xs muted">${HF.esc(m.tournament_name || '')}</div></td>
        <td class="num font-semibold">${m.home_goals ?? 0} - ${m.away_goals ?? 0}</td>
        <td class="num">${L.minute ?? '—'}</td>
        <td class="num">${L.corners ?? '—'}</td>
        <td class="num">${L.cards ?? '—'}</td>
        <td class="text-xs">${L.recommendations.length ? L.recommendations.map((t) => `<span class="badge q-B">${HF.esc(t)}</span>`).join(' ') : '<span class="muted">Sin señales claras</span>'}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
  }

  $('date').onchange = (e) => { state.date = e.target.value; load(); };
  $('refresh').onclick = load;
  load();
  timer = setInterval(load, 30000);
};