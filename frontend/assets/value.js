/* Centro de apuestas de valor: recomendadas y descartadas (con motivo) para una fecha. */
HF.pages.value = (root) => {
  const $ = (id) => document.getElementById(id);
  const state = { date: HF.param('date') || HF.today() };
  root.innerHTML = `
  <section class="flex flex-wrap items-end gap-3">
    <div><h1 class="text-xl font-bold">Apuestas de valor</h1>
      <p class="text-sm muted">Probabilidad del modelo frente a la probabilidad implícita de la cuota (sin margen). Solo se recomiendan las que superan todos los filtros.</p></div>
    <div class="ml-auto flex items-center gap-2"><input type="date" id="date"></div>
  </section>
  <section class="panel"><div class="panel-h"><h2>Recomendadas</h2><span class="text-xs muted" id="meta"></span></div><div class="scroll-x" id="acc"></div></section>
  <section class="panel"><div class="panel-h"><h2>Descartadas automáticamente</h2></div><div class="scroll-x" id="disc"></div></section>
  <p class="text-xs muted">Edge = P(modelo) − P(implícita sin margen) · EV = P × cuota − 1 · Kelly = (b·p − q)/b · Stake = banca × Kelly fraccional (con tope por apuesta). Descartes: EV no positivo, edge bajo, confianza &lt; mínimo, mercado mal calibrado históricamente o margen de la casa alto (poca liquidez). El valor depende de que el modelo esté bien calibrado: revisa «Calibración y backtesting».</p>`;

  const table = (rows, accepted) => (rows.length ? `<table class="t"><thead><tr><th>Partido</th><th>Selección</th><th>Prob.</th><th>Implícita</th><th>Cuota</th><th>Edge</th><th>EV</th><th>Kelly</th><th>Stake</th><th>Confianza</th>${accepted ? '<th>Resultado</th>' : '<th>Motivo</th>'}</tr></thead><tbody>
    ${rows.map((v) => `<tr><td><a href="${HF.link('analysis', { id: v.match_id })}">${HF.esc(v.match)}</a><div class="text-xs muted">${HF.esc(v.tournament_name || '')} · ${HF.time(v.start_time)}</div></td>
      <td>${HF.esc(v.label)}</td><td class="num">${HF.pct(v.model_probability, 1)}</td><td class="num">${HF.pct(v.bookmaker_probability, 1)}</td><td class="num">${HF.n(v.odds)}</td>
      <td class="num ${v.edge_percent > 0 ? 'ok' : 'ko'}">${v.edge_percent > 0 ? '+' : ''}${(v.edge_percent * 100).toFixed(1)}%</td>
      <td class="num ${v.expected_value > 0 ? 'ok' : 'ko'}">${v.expected_value > 0 ? '+' : ''}${HF.pct(v.expected_value, 1)}</td>
      <td class="num">${HF.pct(v.kelly_fraction, 1)}</td><td class="num">${accepted ? HF.n(v.stake) : '—'}</td><td class="num">${Math.round(v.confidence_score)}</td>
      ${accepted ? `<td>${v.outcome === null ? '<span class="muted">pendiente</span>' : `${HF.outcome(v.outcome)} <span class="num">${v.profit >= 0 ? '+' : ''}${HF.n(v.profit)}</span>`}</td>` : `<td class="text-xs muted">${HF.esc(v.discard_reason || '')}</td>`}</tr>`).join('')}
    </tbody></table>` : `<div class="empty">${accepted ? 'Ninguna selección supera los filtros de valor para esta fecha.' : 'Sin cuotas registradas para esta fecha.'}</div>`);

  async function load() {
    $('date').value = state.date;
    HF.setQuery({ date: state.date });
    try {
      const r = await HF.api(`/value-bets?date=${state.date}`);
      $('meta').textContent = `Banca ${r.bankroll} u · Kelly ×${r.kellyFraction}`;
      $('acc').innerHTML = table(r.accepted, true);
      $('disc').innerHTML = table(r.discarded, false);
    } catch (e) { $('acc').innerHTML = `<div class="empty">Error: ${HF.esc(e.message)}</div>`; }
  }
  $('date').onchange = (e) => { state.date = e.target.value; load(); };
  load();
};
