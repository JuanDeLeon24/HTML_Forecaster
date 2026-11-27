/* Análisis detallado de un partido: modelos, mercados, explicación, calidad y combinador. */
HF.pages.analysis = (root) => {
let chart = null;
let data = null;

const panel = (title, body, right = '') => `<section class="panel"><div class="panel-h"><h2>${title}</h2>${right}</div><div class="panel-b">${body}</div></section>`;

async function load() {
  const id = HF.param('id');
  if (!id) { root.innerHTML = '<div class="empty">Falta el parámetro ?id=</div>'; return; }
  try {
    data = await HF.api(`/forecasts/${encodeURIComponent(id)}`);
    render();
  } catch (e) {
    root.innerHTML = `<div class="empty">Error: ${HF.esc(e.message)}</div>`;
  }
}

function render() {
  const { match: m, forecast: f } = data;
  const head = `<section class="flex flex-wrap items-end gap-3">
    <div><div class="text-xs muted">${HF.esc(m.tournament_category ? m.tournament_category + ' · ' : '')}${HF.esc(m.tournament_name || '')} · ${HF.dateTime(m.start_time)} · ${HF.esc(m.status)}</div>
    <h1 class="text-2xl font-bold">${HF.esc(m.home_name)} <span class="muted">vs</span> ${HF.esc(m.away_name)} ${m.home_goals !== null ? `<span class="num">${m.home_goals}-${m.away_goals}</span>` : ''}</h1></div>
    ${f ? `<div class="ml-auto text-xs muted text-right">Pronóstico #${f.id} · modelo v${HF.esc(f.modelVersion)}<br>generado ${HF.dateTime(f.createdAt)}</div>` : ''}</section>`;
  if (!f) { root.innerHTML = head + '<div class="panel empty">Aún no hay pronóstico para este partido.</div>'; return; }
  const o = f.output;
  if (o.status !== 'ok') { root.innerHTML = head + `<div class="warn-box">${HF.esc(o.reason)}</div>` + qualityPanel(f.quality); return; }

  root.innerHTML = head + `
    ${o.pick ? `<section class="panel panel-b flex flex-wrap items-center gap-5">
      <div><div class="text-xs muted">Selección de mayor confianza</div><div class="text-lg font-semibold">${HF.esc(o.pick.label)}</div></div>
      <div class="num"><div class="text-xs muted">Probabilidad${o.calibratedMarkets?.length ? ' (calibrada)' : ''}</div><div class="text-lg font-bold">${HF.pct(o.pick.probability, 1)}</div></div>
      <div><div class="text-xs muted">Score de confianza</div>${o.confidence ? HF.cBadge(o.confidence.grade, o.confidence.score) : HF.qBadge(f.quality.grade, f.quality.score)}</div>
      <div><div class="text-xs muted">Calidad del dato</div>${HF.qBadge(f.quality.grade, f.quality.score)}</div>
      <div class="num"><div class="text-xs muted">Goles esperados</div><div class="text-lg font-bold">${HF.n(o.lambdas.home)} – ${HF.n(o.lambdas.away)}</div></div>
      ${o.confidence ? `<div class="text-xs muted" style="flex-basis:100%">Confianza = datos ${o.confidence.factors.dataQuality}/40 · acuerdo entre modelos ${o.confidence.factors.modelAgreement}/20 · calibración del mercado ${o.confidence.factors.calibration}/15 · precisión reciente ${o.confidence.factors.recentPrecision}/15 · consistencia ${o.confidence.factors.consistency}/10${o.confidence.marketSample < 100 ? ' (mercado sin historial suficiente: calibración y precisión neutrales)' : ''}</div>` : ''}
    </section>` : ''}
    ${f.postAnalysis ? postPanel(f.postAnalysis) : ''}
    <div class="grid lg:grid-cols-3 gap-5">
      <div class="lg:col-span-2 space-y-5">
        ${panel('Comparador de modelos', '<div style="height:240px"><canvas id="models"></canvas></div>' + comparator(o))}
        ${o.factors ? panel('Factores principales', factorsPanel(o)) : ''}
        ${panel('Mercados', marketsTable(o))}
        ${panel('¿Por qué este pronóstico?', o.explanation.map((r) => `<div class="mb-3"><div class="font-semibold text-sm mb-1">${HF.esc(r.title)}</div><ul class="list-disc pl-5 text-sm space-y-0.5">${r.items.map((i) => `<li>${HF.esc(i)}</li>`).join('')}</ul></div>`).join(''))}
        ${panel('Perfil de los equipos', profilesTable(f.inputs.profiles, m))}
        ${panel('Head to Head', h2hTable(f.inputs.h2h, m))}
      </div>
      <div class="space-y-5">
        ${qualityPanel(f.quality)}
        ${contextPanel(o, m)}
        ${panel('Marcador exacto (Dixon-Coles)', heatmap(o.scoreMatrix) + `<div class="text-xs muted mt-2">Más probables: ${o.topScores.slice(0, 5).map((s) => `${s.score} (${HF.pct(s.p, 1)})`).join(' · ')}</div>`)}
        ${panel('Valor esperado vs. cuotas', valueTable(o.value))}
        ${panel('Combinaciones sugeridas', combosList(o.combinations))}
        ${panel('Combinador', builder())}
      </div>
    </div>`;
  drawChart(o);
  bindBuilder();
}

function marketsTable(o) {
  const p = o.probabilities;
  const row = (l, v) => `<tr><td>${l}</td><td class="num" style="width:80px">${HF.pct(v, 1)}</td><td style="width:40%">${HF.pbar(v)}</td></tr>`;
  const sec = (t) => `<tr><th colspan="3">${t}</th></tr>`;
  let h = '<table class="t">';
  h += sec('Resultado') + row(`1 · ${HF.esc(o.match.home)}`, p['1X2'][1]) + row('X · Empate', p['1X2'].X) + row(`2 · ${HF.esc(o.match.away)}`, p['1X2'][2]);
  h += sec('Doble oportunidad') + row('1X', p.DC['1X']) + row('X2', p.DC.X2) + row('12', p.DC[12]);
  h += sec('Goles') + Object.entries(p.OU.over).map(([l, v]) => row(`Más de ${l}`, v)).join('');
  h += sec('Ambos anotan') + row('Sí', p.BTTS.yes) + row('No', p.BTTS.no);
  h += sec(`Corners ${p.CORNERS ? `(esperados ${HF.n(p.CORNERS.expected, 1)})` : ''}`) + (p.CORNERS ? Object.entries(p.CORNERS.over).map(([l, v]) => row(`Más de ${l}`, v)).join('') : `<tr><td colspan="3" class="muted text-xs">${HF.esc(o.corners.reason)}</td></tr>`);
  h += sec(`Tarjetas ${p.CARDS ? `(esperadas ${HF.n(p.CARDS.expected, 1)})` : ''}`) + (p.CARDS ? Object.entries(p.CARDS.over).map(([l, v]) => row(`Más de ${l}`, v)).join('') : `<tr><td colspan="3" class="muted text-xs">${HF.esc(o.cards.reason)}</td></tr>`);
  return h + '</table>';
}

function profilesTable(pr, m) {
  const win = [['last5', 'Últ. 5'], ['last10', 'Últ. 10'], ['last20', 'Últ. 20'], ['last50', 'Últ. 50'], ['venue', 'Sede']];
  const team = (p, name) => `<div class="font-semibold text-sm mt-2 mb-1">${HF.esc(name)} <span class="muted text-xs">forma ${HF.esc(p.form || '—')} · ataque ${HF.n(p.strength.attack)} · defensa ${HF.n(p.strength.defense)}</span></div>
    <div class="scroll-x"><table class="t"><thead><tr><th></th><th>n</th><th>G-E-P</th><th>Pts/p</th><th>GF</th><th>GC</th><th>BTTS</th><th>O2.5</th><th>Port. 0</th><th>Corners F/C</th><th>Tarjetas F/C</th></tr></thead><tbody>
    ${win.map(([k, l]) => { const s = p[k]; return `<tr><td class="muted">${l}</td><td class="num">${s.n}</td><td class="num">${s.wins}-${s.draws}-${s.losses}</td><td class="num">${HF.n(s.ppg)}</td><td class="num">${HF.n(s.goalsFor)}</td><td class="num">${HF.n(s.goalsAgainst)}</td><td class="num">${HF.pct(s.btts)}</td><td class="num">${HF.pct(s.over25)}</td><td class="num">${HF.pct(s.cleanSheets)}</td><td class="num">${s.statsN ? `${HF.n(s.cornersFor, 1)}/${HF.n(s.cornersAgainst, 1)} <span class="muted">(${s.statsN})</span>` : '—'}</td><td class="num">${s.cardsN ? `${HF.n(s.cardsFor, 1)}/${HF.n(s.cardsAgainst, 1)}` : '—'}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  return team(pr.home, m.home_name) + team(pr.away, m.away_name);
}

function h2hTable(h, m) {
  if (!h.n) return '<div class="muted text-sm">Sin enfrentamientos directos registrados.</div>';
  const w = (x, l) => `<tr><td class="muted">${l}</td><td class="num">${x.n}</td><td class="num">${x.homeTeamWins}-${x.draws}-${x.awayTeamWins}</td><td class="num">${HF.n(x.avgGoals)}</td><td class="num">${HF.pct(x.btts)}</td><td class="num">${HF.pct(x.over25)}</td><td class="num">${x.cornersN ? HF.n(x.avgCorners, 1) : '—'}</td><td class="num">${x.cardsN ? HF.n(x.avgCards, 1) : '—'}</td></tr>`;
  return `<div class="scroll-x"><table class="t"><thead><tr><th></th><th>n</th><th>${HF.esc(m.home_short || m.home_name)}-E-${HF.esc(m.away_short || m.away_name)}</th><th>Goles</th><th>BTTS</th><th>O2.5</th><th>Corners</th><th>Tarjetas</th></tr></thead><tbody>
    ${w(h.last5, 'Últ. 5')}${w(h.last10, 'Últ. 10')}${w(h.last20, 'Últ. 20')}</tbody></table></div>
    <div class="text-xs muted mt-2">${h.games.map((g) => `${HF.dateTime(g.startTime).split(',')[0]}: ${g.score}${g.homeTeamAtHome ? '' : ' (inv.)'}`).join(' · ')}</div>`;
}

function qualityPanel(q) {
  const s = q.samples;
  return panel('Calidad del dato', `<div class="flex items-center gap-3 mb-3"><div class="text-3xl font-bold num">${q.score}</div>${HF.qBadge(q.grade)}<div class="text-xs muted">de 100</div></div>
    <table class="t"><tbody>
      <tr><td>Partidos local / visitante</td><td class="num">${s.home} / ${s.away}</td></tr>
      <tr><td>Con estadísticas (corners/tarjetas)</td><td class="num">${s.homeStats} / ${s.awayStats}</td></tr>
      <tr><td>Enfrentamientos directos</td><td class="num">${s.h2h}</td></tr>
      <tr><td>Pool de normalización</td><td class="num">${s.pool} (${HF.esc(s.poolScope)})</td></tr>
      <tr><td>Antigüedad del último dato</td><td class="num">${q.staleDays ?? '—'} días</td></tr>
      <tr><td>Cuotas disponibles</td><td>${q.oddsAvailable ? 'sí' : 'no'}</td></tr>
    </tbody></table>
    ${q.warnings.length ? `<div class="warn-box mt-3"><ul class="list-disc pl-4 space-y-1">${q.warnings.map((w) => `<li>${HF.esc(w)}</li>`).join('')}</ul></div>` : ''}`);
}

function heatmap(mx) {
  const N = 6;
  let max = 0;
  for (let h = 0; h < N; h++) for (let a = 0; a < N; a++) max = Math.max(max, mx[h][a]);
  let t = `<div class="scroll-x"><table class="heat"><tr><th>L\\V</th>${Array.from({ length: N }, (_, a) => `<th>${a}</th>`).join('')}</tr>`;
  for (let h = 0; h < N; h++) {
    t += `<tr><th>${h}</th>`;
    for (let a = 0; a < N; a++) {
      const v = mx[h][a];
      t += `<td class="num" style="background:color-mix(in srgb, var(--accent) ${Math.round((v / max) * 70)}%, transparent)">${(v * 100).toFixed(1)}</td>`;
    }
    t += '</tr>';
  }
  return t + '</table></div><div class="text-xs muted mt-1">Probabilidad (%) por marcador local (filas) – visitante (columnas).</div>';
}

function valueTable(v) {
  if (!v || !v.length) return '<div class="muted text-sm">No hay cuotas registradas para este partido.</div>';
  return `<div class="scroll-x"><table class="t"><thead><tr><th>Selección</th><th>Prob.</th><th>Cuota</th><th>Edge</th><th>EV</th><th>Stake</th></tr></thead><tbody>${v.slice(0, 12).map((x) => `<tr>
    <td>${HF.esc(x.label)}${x.accepted ? ' <span class="badge q-A">valor</span>' : x.discardReason ? `<div class="text-xs muted">${HF.esc(x.discardReason)}</div>` : ''}</td>
    <td class="num">${HF.pct(x.probability, 1)}</td><td class="num">${HF.n(x.odds)}</td>
    <td class="num ${x.edge > 0 ? 'ok' : 'ko'}">${x.edge !== undefined ? `${x.edge > 0 ? '+' : ''}${(x.edge * 100).toFixed(1)}%` : '—'}</td>
    <td class="num ${x.ev > 0 ? 'ok' : 'ko'}">${x.ev > 0 ? '+' : ''}${HF.pct(x.ev, 1)}</td>
    <td class="num">${x.accepted ? HF.n(x.stake) : '—'}</td></tr>`).join('')}</tbody></table></div>
    <p class="text-xs muted mt-2">Edge = prob. modelo − prob. implícita sin margen. EV = prob × cuota − 1. Stake = Kelly fraccional sobre la banca configurada, con tope. Solo se recomiendan las que superan todos los filtros.</p>`;
}

function combosList(c) {
  if (!c || !c.length) return '<div class="muted text-sm">Ninguna combinación supera el 45% de probabilidad conjunta.</div>';
  return c.map((x) => `<div class="mb-3"><div class="text-sm font-medium">${HF.esc(x.label)}</div>
    <div class="text-xs muted num">Conjunta ${HF.pct(x.joint, 1)} · producto ingenuo ${HF.pct(x.naiveProduct, 1)} · riesgo ${HF.esc(x.risk)} · cuota justa ${HF.n(x.fairOdds)}</div>${HF.pbar(x.joint)}</div>`).join('');
}

const LEG_OPTIONS = [
  ['1X2|1|0', 'Gana local'], ['1X2|X|0', 'Empate'], ['1X2|2|0', 'Gana visitante'], ['DC|1X|0', '1X'], ['DC|X2|0', 'X2'], ['DC|12|0', '12'],
  ['OU|over|1.5', 'Más de 1.5 goles'], ['OU|over|2.5', 'Más de 2.5 goles'], ['OU|over|3.5', 'Más de 3.5 goles'], ['OU|under|2.5', 'Menos de 2.5 goles'], ['OU|under|3.5', 'Menos de 3.5 goles'],
  ['BTTS|yes|0', 'Ambos anotan: Sí'], ['BTTS|no|0', 'Ambos anotan: No'],
  ['CORNERS|over|8.5', 'Más de 8.5 corners'], ['CORNERS|over|9.5', 'Más de 9.5 corners'], ['CORNERS|under|10.5', 'Menos de 10.5 corners'],
  ['CARDS|over|3.5', 'Más de 3.5 tarjetas'], ['CARDS|over|4.5', 'Más de 4.5 tarjetas'],
];
function builder() {
  return `<div class="space-y-2">${LEG_OPTIONS.map(([v, l]) => `<label class="flex items-center gap-2 text-sm"><input type="checkbox" class="leg" value="${v}"> ${l}</label>`).join('')}
    <div id="combo-out" class="text-sm pt-2"></div></div>`;
}
function bindBuilder() {
  const boxes = [...document.querySelectorAll('.leg')];
  boxes.forEach((b) => { b.onchange = async () => {
    const legs = boxes.filter((x) => x.checked).map((x) => { const [market, selection, line] = x.value.split('|'); return { market, selection, line: Number(line) }; });
    const out = document.getElementById('combo-out');
    if (!legs.length) { out.innerHTML = ''; return; }
    try {
      const r = await HF.api('/combination', { method: 'POST', body: JSON.stringify({ matchId: data.match.id, legs }) });
      out.innerHTML = r.available ? `<div class="font-semibold">Probabilidad conjunta: <span class="num">${HF.pct(r.joint, 1)}</span> · riesgo ${HF.esc(r.risk)}</div>
        <div class="text-xs muted num">Individuales: ${r.individual.map((l) => HF.pct(l.probability, 1)).join(' × ')} = ${HF.pct(r.naiveProduct, 1)} si fueran independientes · cuota justa ${HF.n(r.fairOdds)}</div>
        ${r.assumptions.length ? `<div class="text-xs muted">${HF.esc(r.assumptions.join(' '))}</div>` : ''}` : `<div class="ko">${HF.esc(r.reason)}</div>`;
    } catch (e) { out.textContent = e.message; }
  }; });
}

function postPanel(pa) {
  return panel('Resultado vs. pronóstico', `<div class="grid sm:grid-cols-3 gap-3 text-sm mb-3">
      <div><div class="text-xs muted">Goles esperados → reales</div><div class="font-semibold num">${pa.expected.goals ?? '—'} → ${pa.actual.goals} (${HF.esc(pa.actual.score)})</div></div>
      <div><div class="text-xs muted">Corners esperados → reales</div><div class="font-semibold num">${HF.n(pa.expected.corners, 1)} → ${pa.actual.corners ?? '—'}</div></div>
      <div><div class="text-xs muted">Acierto en selecciones ≥50%</div><div class="font-semibold num">${HF.pct(pa.hitRateHighProb)}</div></div></div>
    ${pa.causes.length ? `<div class="font-semibold text-sm mb-1">Causas detectadas en los datos</div><ul class="list-disc pl-5 text-sm">${pa.causes.map((c) => `<li>${HF.esc(c.text)}</li>`).join('')}</ul>` : `<div class="muted text-sm">${HF.esc(pa.note || '')}</div>`}
    ${pa.failedHighConfidence.length ? `<div class="text-xs muted mt-2">Fallos con prob. ≥60%: ${pa.failedHighConfidence.map((p) => `${p.market} ${p.selection} ${p.line || ''} (${HF.pct(p.probability)})`).join(' · ')}</div>` : ''}`);
}

function drawChart(o) {
  const c = HF.chartColors();
  const rows = o.modelComparison || [['Poisson-DC', o.models.poisson], ['Elo', o.models.elo], ['Ponderado', o.models.weighted], ['Ensamble (final)', o.probabilities['1X2']]].filter(([, p]) => p).map(([name, p]) => ({ name, 1: p[1], X: p.X, 2: p[2] }));
  const palette = ['#94a3b8', '#a78bfa', c.home, '#f59e0b', '#14b8a6', '#22c55e', '#ec4899', c.accent];
  if (chart) chart.destroy();
  if (typeof Chart === 'undefined') return;
  chart = new Chart(document.getElementById('models'), {
    type: 'bar',
    data: { labels: ['1 · Local', 'X · Empate', '2 · Visitante'], datasets: rows.map((r, i) => ({ label: r.name, data: [r[1], r.X, r[2]].map((x) => x * 100), backgroundColor: i === rows.length - 1 ? c.accent : HF.alpha(palette[i % palette.length], 0.6), borderRadius: 3 })) },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: c.text, boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${x.raw.toFixed(1)}%` } } },
      scales: { x: { ticks: { color: c.muted }, grid: { display: false } }, y: { ticks: { color: c.muted, callback: (v) => `${v}%` }, grid: { color: c.border }, beginAtZero: true } },
    },
  });
  HF.charts.push(chart);
}

function comparator(o) {
  const rows = o.modelComparison;
  if (!rows) return '';
  const fin = rows.find((r) => r.key === 'ensemble');
  const others = rows.filter((r) => r.key !== 'ensemble');
  const sd = (k) => { const v = others.map((r) => r[k]); const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1)); };
  const w = o.models.ensembleWeights || {};
  const wKey = { dixon_coles: 'poisson', elo: 'elo', weighted: 'weighted', xg: 'xg', logistic: 'logistic' };
  return `<div class="scroll-x mt-3"><table class="t"><thead><tr><th>Modelo</th><th>1</th><th>X</th><th>2</th><th>λ local–visit.</th><th>Δ vs ensamble (1)</th><th>Peso</th></tr></thead><tbody>
    ${rows.map((r) => `<tr${r.key === 'ensemble' ? ' style="font-weight:600"' : ''}><td>${HF.esc(r.name)}</td><td class="num">${HF.pct(r[1], 1)}</td><td class="num">${HF.pct(r.X, 1)}</td><td class="num">${HF.pct(r[2], 1)}</td>
      <td class="num">${r.lambdaHome !== null ? `${HF.n(r.lambdaHome)} – ${HF.n(r.lambdaAway)}` : '—'}</td>
      <td class="num">${r.key === 'ensemble' ? '—' : `${r[1] >= fin[1] ? '+' : ''}${((r[1] - fin[1]) * 100).toFixed(1)} pp`}</td>
      <td class="num">${wKey[r.key] ? HF.pct(w[wKey[r.key]] || 0) : r.key === 'ensemble' ? '' : '<span class="muted">referencia</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="text-xs muted mt-2">Dispersión entre modelos (desv. típica): 1 ${HF.pct(sd(1), 1)} · X ${HF.pct(sd('X'), 1)} · 2 ${HF.pct(sd(2), 1)}. Poisson clásico y bivariado se muestran como referencia; el ensamble usa Dixon-Coles.${o.models.elo ? '' : ' Elo sin muestra suficiente (peso 0).'}${o.models.xg ? '' : ' xG sin cobertura suficiente (peso 0).'}${o.models.logistic ? '' : ' Regresión logística aún no entrenada/validada.'}</p>`;
}

function factorsPanel(o) {
  const items = o.factors.items;
  if (!items.length) return '<div class="muted text-sm">Ningún factor mueve la probabilidad más de 0.2 puntos.</div>';
  const max = Math.max(...items.map((x) => Math.abs(x.delta)));
  return `<div class="text-xs muted mb-2">Aporte a la probabilidad de victoria de <b>${HF.esc(o.factors.favorite)}</b> (${HF.pct(o.probabilities['1X2'][o.factors.selection], 1)}):</div>
    ${items.map((x) => `<div class="flex items-center gap-3 text-sm mb-1"><div style="width:150px">${HF.esc(x.factor)}</div>
      <div class="flex-1"><div class="pbar"><div style="width:${(Math.abs(x.delta) / max) * 100}%;background:${x.delta >= 0 ? 'var(--good)' : 'var(--bad)'}"></div></div></div>
      <div class="num ${x.delta >= 0 ? 'ok' : 'ko'}" style="width:70px;text-align:right">${x.delta >= 0 ? '+' : ''}${(x.delta * 100).toFixed(1)}%</div></div>`).join('')}
    <p class="text-xs muted mt-2">${HF.esc(o.factors.method)}</p>
    ${o.factors.logisticImportance ? `<div class="text-xs muted mt-2">Importancia de variables (regresión logística, coef. estandarizados): ${o.factors.logisticImportance.map((x) => `${HF.esc(x.feature)} ${x.weight}`).join(' · ')}</div>` : ''}`;
}

function contextPanel(o, m) {
  const f = o.fatigue || {};
  const c = o.context || {};
  const b = o.bayesian;
  const row = (l, h, a) => `<tr><td>${l}</td><td class="num">${h}</td><td class="num">${a}</td></tr>`;
  return panel('Contexto físico y competitivo', `<table class="t"><thead><tr><th></th><th>${HF.esc(m.home_short || m.home_name)}</th><th>${HF.esc(m.away_short || m.away_name)}</th></tr></thead><tbody>
    ${row('Días de descanso', f.home?.restDays ?? '—', f.away?.restDays ?? '—')}
    ${row('Partidos últimos 7 días', f.home?.matches7 ?? '—', f.away?.matches7 ?? '—')}
    ${row('Partidos últimos 14 días', f.home?.matches14 ?? '—', f.away?.matches14 ?? '—')}
    ${row('Posición / puntos', c.home ? `${c.home.position}º · ${c.home.points}` : '—', c.away ? `${c.away.position}º · ${c.away.points}` : '—')}
    ${b ? row('Ataque bayesiano (±σ)', `${b.home.attack} ±${b.home.attackSd}`, `${b.away.attack} ±${b.away.attackSd}`) : ''}
    ${b ? row('Defensa bayesiana (±σ)', `${b.home.defense} ±${b.home.defenseSd}`, `${b.away.defense} ±${b.away.defenseSd}`) : ''}
    ${o.xgLambdas ? row('Goles esperados por xG', HF.n(o.xgLambdas.home), HF.n(o.xgLambdas.away)) : ''}
  </tbody></table><p class="text-xs muted mt-2">El descanso entra en el modelo solo a través de la regresión logística cuando esta demuestra aportar. Viajes, motivación y alineaciones aún no se capturan.</p>`);
}

HF.onTheme = () => data?.forecast?.output?.status === 'ok' && drawChart(data.forecast.output);
load();
};
