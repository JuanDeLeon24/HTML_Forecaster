/* En vivo: probabilidades actualizadas con el minuto y el marcador (Poisson sobre el tiempo restante). */
HF.pages.live = (root) => {
  const $ = (id) => document.getElementById(id);
  const state = { date: HF.param('date') || HF.today() };
  root.innerHTML = `
  <section class="flex flex-wrap items-end gap-3">
    <div><h1 class="text-xl font-bold">En vivo</h1>
      <p class="text-sm muted">Probabilidades recalculadas con el minuto y el marcador a partir de los goles esperados del pronóstico previo. Se actualiza cada 60 s.</p></div>
    <div class="ml-auto flex items-center gap-2">
      <input type="date" id="date"><button class="btn btn-ghost" id="refresh">Actualizar ahora</button><span id="status" class="text-xs muted"></span>
    </div>
  </section>
  <section class="panel"><div class="scroll-x" id="live-body"><div class="empty">Cargando…</div></div></section>
  <p class="text-xs muted">Supuesto: intensidad de goles constante durante el partido; no ajusta expulsiones ni cambios tácticos. Úsalo como referencia, no como recomendación automática.</p>`;

  async function load() {
    $('date').value = state.date;
    try {
      const r = await HF.api(`/live?date=${state.date}`);
      render(r);
      $('status').textContent = `${r.count} en juego · ${new Date().toLocaleTimeString()}${r.refreshError ? ' · no se pudo actualizar: ' + r.refreshError : ''}`;
    } catch (e) { $('live-body').innerHTML = `<div class="empty">Error: ${HF.esc(e.message)}</div>`; }
  }

  function render(r) {
    if (!r.matches.length) { $('live-body').innerHTML = '<div class="empty">No hay partidos en juego en esta fecha.</div>'; return; }
    $('live-body').innerHTML = `<table class="t"><thead><tr><th>Partido</th><th>Marcador</th><th>Min</th><th>1 · X · 2 ahora</th><th>O1.5</th><th>O2.5</th><th>BTTS</th><th>Corners</th><th>Tarjetas</th><th>Señales (≥ 80%)</th></tr></thead><tbody>${r.matches.map((x) => {
      const m = x.match;
      const L = x.live;
      const p = L.probabilities;
      return `<tr><td><a href="${HF.link('analysis', { id: m.id })}">${HF.esc(m.home_name)} vs ${HF.esc(m.away_name)}</a><div class="text-xs muted">${HF.esc(m.tournament_name || '')}</div></td>
        <td class="num font-semibold">${HF.esc(L.score)}</td><td class="num">${L.minute ?? '—'}'</td>
        <td>${p ? `${HF.bar3(p['1X2'])}<div class="text-xs muted num mt-1">${HF.pct(p['1X2'][1])} · ${HF.pct(p['1X2'].X)} · ${HF.pct(p['1X2'][2])}</div>` : `<span class="text-xs muted">${HF.esc(L.basis || '')}</span>`}</td>
        <td class="num">${p ? HF.pct(p.over['1.5']) : '—'}</td><td class="num">${p ? HF.pct(p.over['2.5']) : '—'}</td><td class="num">${p ? HF.pct(p.btts) : '—'}</td>
        <td class="num">${L.corners ?? '—'}${p?.cornersOver ? `<div class="text-xs muted">O8.5 ${HF.pct(p.cornersOver['8.5'])}</div>` : ''}</td>
        <td class="num">${L.cards ?? '—'}</td>
        <td class="text-xs">${L.signals.length ? L.signals.map((t) => `<div>${HF.esc(t)}</div>`).join('') : '<span class="muted">—</span>'}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  $('date').onchange = (e) => { state.date = e.target.value; load(); };
  $('refresh').onclick = load;
  const timer = setInterval(load, 60000);
  HF.onLeave = () => clearInterval(timer);
  load();
};
