/* Panel de resultados: métricas, calibración y parámetros aprendidos. */
HF.pages.stats = (root) => {
const $ = (id) => document.getElementById(id);
let chart = null;
let report = null;
let bt = null;
let monTab = 'daily';
const extraCharts = {};
root.innerHTML = `
  <section class="flex flex-wrap items-end gap-3">
    <div><h1 class="text-xl font-bold">Calibración y backtesting</h1>
      <p class="text-sm muted">Calculado solo con predicciones liquidadas contra resultados reales.</p></div>
    <div class="ml-auto flex flex-wrap items-center gap-2 text-sm">
      <label>Desde <input type="date" id="from"></label>
      <label>Hasta <input type="date" id="to"></label>
      <select id="market"><option value="">Todos los mercados</option><option>1X2</option><option>DC</option><option>OU</option><option>BTTS</option><option>TEAM_OU</option><option>CORNERS</option><option>CARDS</option></select>
      <button class="btn" id="apply">Aplicar</button>
      <button class="btn btn-ghost" id="settle" title="Descarga resultados de partidos terminados y liquida predicciones">Liquidar resultados</button>
      <button class="btn btn-ghost" id="learn" title="Reajusta pesos del ensamble y ρ con los datos liquidados">Reaprender</button>
      <button class="btn btn-ghost" id="csv-pred" title="Descargar todas las predicciones liquidadas">CSV predicciones</button>
      <button class="btn btn-ghost" id="csv-value" title="Descargar las apuestas de valor">CSV valor</button>
    </div>
  </section>
  <div id="msg" class="text-sm muted"></div>
  <section class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3" id="kpis"></section>
  <div id="drift"></div>
  <div class="grid lg:grid-cols-2 gap-5">
    <section class="panel"><div class="panel-h"><h2>Calibración</h2><span class="text-xs muted">ideal: puntos sobre la diagonal</span></div><div class="panel-b"><div style="height:300px"><canvas id="calib"></canvas></div></div></section>
    <section class="panel"><div class="panel-h"><h2>Por mercado</h2></div><div class="scroll-x" id="bymarket"></div></section>
  </div>
  <div class="grid lg:grid-cols-2 gap-5">
    <section class="panel"><div class="panel-h"><h2>Distribución de probabilidades (sharpness)</h2></div><div class="panel-b"><div style="height:220px"><canvas id="sharp"></canvas></div></div></section>
    <section class="panel"><div class="panel-h"><h2>Corrección automática por mercado</h2></div><div class="scroll-x" id="calmethods"></div></section>
  </div>
  <section class="panel"><div class="panel-h"><h2>Backtesting</h2><span class="text-xs muted" id="bt-meta"></span></div>
    <div class="panel-b"><div style="height:240px"><canvas id="equity"></canvas></div></div><div class="scroll-x" id="bt"></div></section>
  <section class="panel"><div class="panel-h"><h2>Monitoreo</h2><div class="tabs" id="mon-tabs"></div></div><div class="scroll-x" id="mon"></div></section>
  <section class="panel"><div class="panel-h"><h2>Historial de aprendizaje (walk-forward)</h2></div><div class="scroll-x" id="train"></div></section>
  <div class="grid lg:grid-cols-2 gap-5">
    <section class="panel"><div class="panel-h"><h2>1X2 (multiclase)</h2></div><div class="panel-b" id="mc"></div></section>
    <section class="panel"><div class="panel-h"><h2>Parámetros del modelo</h2></div><div class="panel-b" id="params"></div></section>
  </div>
  <section class="panel panel-b text-xs muted space-y-1">
    <div><b>Brier</b>: error cuadrático medio de la probabilidad (0 perfecto; 0.25 = decir 50% siempre). <b>Brier Skill</b>: mejora frente a predecir siempre la tasa base (&gt;0 aporta valor).</div>
    <div><b>Log Loss</b>: penaliza fuertemente la sobreconfianza. <b>RPS</b>: Ranked Probability Score del 1X2 (tiene en cuenta el orden 1 &lt; X &lt; 2).</div>
    <div><b>ECE</b>: diferencia media (ponderada) entre probabilidad predicha y frecuencia observada por tramos; <b>MCE</b>: la mayor de esas diferencias. <b>Sharpness</b>: cuán decididas son las probabilidades (0 = siempre 50%).</div>
    <div><b>Yield</b> = beneficio / total apostado. <b>ROI</b> = beneficio / banca inicial. <b>Drawdown</b>: mayor caída desde un máximo de la curva de beneficio.</div>
    <div><b>Accuracy / Precision / Recall / F1</b>: con umbral 50% («el modelo dijo que ocurría»). <b>ROI virtual</b>: 1 unidad por pick principal con cuota real registrada.</div>
  </section>`;

async function load() {
  const q = new URLSearchParams();
  if ($('from').value) q.set('from', $('from').value);
  if ($('to').value) q.set('to', $('to').value);
  if ($('market').value) q.set('market', $('market').value);
  try {
    [report, bt] = await Promise.all([HF.api(`/performance?${q}`), HF.api('/backtesting')]);
    render();
    renderExtra();
  } catch (e) { $('msg').textContent = `Error: ${e.message}`; }
}

const ci = (c, d) => (c ? `IC95 ${HF.n(c.low, d)}–${HF.n(c.high, d)}` : '');

function render() {
  const o = report.overall;
  const pk = report.picks;
  const roi = report.roi;
  if (!o.n) {
    $('kpis').innerHTML = '';
    $('msg').innerHTML = 'Todavía no hay predicciones liquidadas. Las métricas aparecerán cuando terminen los partidos pronosticados y se pulse «Liquidar resultados».';
  } else $('msg').textContent = `${report.events} eventos evaluados (una fila por evento; ${report.rowsTotal} filas incluyendo selecciones complementarias) · ${report.result1X2.n || 0} partidos 1X2 · ${pk.n} picks principales.`;
  const k = [
    ['Eventos', o.n ?? 0, 'sin doble conteo'], ['Brier', HF.n(o.brier, 3), ci(report.ci?.brier, 3) || `skill ${HF.n(o.brierSkill, 3)}`], ['Log Loss', HF.n(o.logLoss, 3), ci(report.ci?.logLoss, 3) || 'menor es mejor'],
    ['RPS 1X2', HF.n(report.result1X2.rps, 4), `${report.result1X2.n || 0} partidos`], ['ECE', HF.pct(o.ece, 1), `MCE ${HF.pct(o.mce, 1)}`], ['Sharpness', HF.n(o.sharpness, 3), '0 = siempre 50%'],
    ['Accuracy', HF.pct(o.accuracy, 1), 'umbral 50%'], ['Precision', HF.pct(o.precision, 1), ''], ['Recall', HF.pct(o.recall, 1), ''], ['F1', HF.n(o.f1, 3), ''],
    ['Yield picks', roi.yield === null || roi.yield === undefined ? '—' : HF.pct(roi.yield, 1), report.ci?.yield ? `IC95 ${HF.pct(report.ci.yield.low, 1)} a ${HF.pct(report.ci.yield.high, 1)}` : `${roi.bets} picks con cuota`], ['ROI picks', roi.roi === null || roi.roi === undefined ? '—' : HF.pct(roi.roi, 1), `beneficio ${HF.n(roi.profit)} u / banca ${roi.bankroll ?? 100} u`],
  ];
  if (o.n) $('kpis').innerHTML = k.map(([l, v, s]) => `<div class="panel kpi"><div class="l">${l}</div><div class="v num">${v}</div><div class="text-xs muted">${s}</div></div>`).join('');

  const bm = Object.entries(report.byMarket);
  $('bymarket').innerHTML = bm.length ? `<table class="t"><thead><tr><th>Mercado</th><th>n</th><th>Brier</th><th>Skill</th><th>Log Loss</th><th>ECE</th><th>Acc.</th><th>F1</th><th>Media pred.</th><th>Observado</th></tr></thead><tbody>${bm.map(([m, x]) => `<tr><td>${HF.esc(m)}</td><td class="num">${x.n}</td><td class="num">${HF.n(x.brier, 3)}</td><td class="num ${x.brierSkill > 0 ? 'ok' : 'ko'}">${HF.n(x.brierSkill, 3)}</td><td class="num">${HF.n(x.logLoss, 3)}</td><td class="num">${HF.pct(x.ece, 1)}</td><td class="num">${HF.pct(x.accuracy, 1)}</td><td class="num">${HF.n(x.f1, 3)}</td><td class="num">${HF.pct(x.meanPredicted, 1)}</td><td class="num">${HF.pct(x.observedRate, 1)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin datos.</div>';

  const mc = report.result1X2;
  $('mc').innerHTML = mc.n ? `<table class="t"><tbody><tr><td>Partidos</td><td class="num">${mc.n}</td></tr><tr><td>Acierto del resultado más probable</td><td class="num">${HF.pct(mc.accuracy, 1)}</td></tr><tr><td>Brier multiclase</td><td class="num">${HF.n(mc.brier, 3)}</td></tr><tr><td>RPS</td><td class="num">${HF.n(mc.rps, 4)}</td></tr><tr><td>Log Loss</td><td class="num">${HF.n(mc.logLoss, 3)}</td></tr></tbody></table>` : '<div class="muted text-sm">Sin partidos 1X2 liquidados.</div>';

  const p = report.params;
  const learned = report.learnedHistory;
  $('params').innerHTML = `<table class="t"><tbody>
    <tr><td>Versión</td><td>${HF.esc(p.version)}</td></tr>
    <tr><td>Regresión logística</td><td>${p.learned.logistic ? `<span class="badge q-A">entrenada (n=${p.learned.logistic.sampleSize})</span>` : '<span class="badge q-C">sin entrenar</span>'}</td></tr>
    <tr><td>Pesos del ensamble</td><td class="num">${Object.entries(p.ensemble).map(([a, b]) => `${a} ${HF.pct(b, 1)}`).join(' · ')} ${p.learned.ensemble ? `<span class="badge q-A">aprendido (n=${p.learned.ensemble.sampleSize})</span>` : '<span class="badge q-C">por defecto</span>'}</td></tr>
    <tr><td>ρ Dixon-Coles</td><td class="num">${p.dixonColesRho} ${p.learned.dixonColesRho ? `<span class="badge q-A">aprendido (n=${p.learned.dixonColesRho.sampleSize})</span>` : '<span class="badge q-C">por defecto</span>'}</td></tr>
    <tr><td>Factores modelo ponderado</td><td class="num">${Object.entries(p.weightedFactors).map(([a, b]) => `${a} ${HF.pct(b)}`).join(' · ')}</td></tr>
    <tr><td>Elo</td><td class="num">K=${p.eloK} · ventaja local ${p.eloHomeAdvantage}</td></tr>
    </tbody></table>
    ${learned.find((l) => l.key === 'ensemble_weights')?.metric ? (() => { const m = learned.find((l) => l.key === 'ensemble_weights').metric; return `<div class="text-xs muted mt-2">Brier 1X2 por modelo — Poisson ${HF.n(m.brierSingle.poisson, 4)} · Elo ${HF.n(m.brierSingle.elo, 4)} · Ponderado ${HF.n(m.brierSingle.weighted, 4)} · Ensamble final ${HF.n(m.brierFinal, 4)}</div>`; })() : ''}`;
  drawCalibration();
}

function drawCalibration() {
  const c = HF.chartColors();
  const pts = (arr) => arr.filter((b) => b.n > 0).map((b) => ({ x: b.predicted * 100, y: b.observed * 100, n: b.n }));
  if (chart) chart.destroy();
  if (typeof Chart === 'undefined') return;
  chart = new Chart($('calib'), {
    type: 'scatter',
    data: { datasets: [
      { label: 'Ideal', data: [{ x: 0, y: 0 }, { x: 100, y: 100 }], showLine: true, borderColor: c.muted, borderDash: [4, 4], pointRadius: 0 },
      { label: 'Todas las predicciones', data: pts(report.calibration), showLine: true, borderColor: c.accent, backgroundColor: c.accent },
      { label: 'Picks principales', data: pts(report.calibrationPicks), showLine: true, borderColor: c.away, backgroundColor: c.away },
      { label: 'Tramos de igual frecuencia', data: pts(report.calibrationQuantiles || []), showLine: true, borderColor: c.good, backgroundColor: c.good, borderDash: [2, 2] },
    ] },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: c.text, boxWidth: 12 } }, tooltip: { callbacks: { label: (x) => `pred ${x.raw.x.toFixed(1)}% → obs ${x.raw.y.toFixed(1)}%${x.raw.n ? ` (n=${x.raw.n})` : ''}` } } },
      scales: {
        x: { min: 0, max: 100, title: { display: true, text: 'Probabilidad predicha (%)', color: c.muted }, ticks: { color: c.muted }, grid: { color: c.border } },
        y: { min: 0, max: 100, title: { display: true, text: 'Frecuencia observada (%)', color: c.muted }, ticks: { color: c.muted }, grid: { color: c.border } },
      },
    },
  });
  HF.charts.push(chart);
}

function renderExtra() {
  const c = HF.chartColors();
  const d = report.drift;
  $('drift').innerHTML = d && d.drift ? `<div class="warn-box">Deriva detectada: el error reciente (${HF.n(d.recentLoss, 3)}) supera al histórico (${HF.n(d.historicalLoss, 3)}), z = ${HF.n(d.z)}. Los pesos se congelan hasta estabilizar.</div>` : '';
  // Sharpness
  if (typeof Chart !== 'undefined') {
    for (const k of Object.keys(extraCharts)) { extraCharts[k].destroy(); delete extraCharts[k]; }
    const sd = report.sharpnessDistribution || [];
    extraCharts.sharp = new Chart($('sharp'), {
      type: 'bar', data: { labels: sd.map((b) => `${Math.round(b.from * 100)}–${Math.round(b.to * 100)}%`), datasets: [{ label: 'Predicciones', data: sd.map((b) => b.n), backgroundColor: HF.alpha(c.accent, 0.6), borderRadius: 3 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: c.muted }, grid: { display: false } }, y: { ticks: { color: c.muted }, grid: { color: c.border }, beginAtZero: true } } },
    });
    HF.charts.push(extraCharts.sharp);
    const colors = [c.accent, c.good, c.away, '#f59e0b', '#a78bfa', '#14b8a6', '#94a3b8'];
    const strat = Object.entries(bt.strategies).filter(([, v]) => v.totalBets);
    extraCharts.equity = new Chart($('equity'), {
      type: 'line', data: { datasets: strat.map(([k, v], i) => ({ label: k, data: v.curve.map((p, j) => ({ x: j + 1, y: p.profit })), borderColor: colors[i % colors.length], backgroundColor: colors[i % colors.length], pointRadius: 0, tension: 0.1 })) },
      options: { maintainAspectRatio: false, parsing: false, plugins: { legend: { labels: { color: c.text, boxWidth: 10 } } }, scales: { x: { type: 'linear', title: { display: true, text: 'Apuestas', color: c.muted }, ticks: { color: c.muted }, grid: { color: c.border } }, y: { title: { display: true, text: 'Beneficio (u)', color: c.muted }, ticks: { color: c.muted }, grid: { color: c.border } } } },
    });
    HF.charts.push(extraCharts.equity);
  }
  const cal = report.calibrationResults || [];
  const learned = report.params.learned || {};
  $('calmethods').innerHTML = cal.length ? `<table class="t"><thead><tr><th>Mercado</th><th>n</th><th>Brier</th><th>ECE</th><th>MCE</th><th>Sharpness</th><th>Corrección</th></tr></thead><tbody>${cal.map((r) => `<tr><td>${HF.esc(r.scope)}</td><td class="num">${r.n}</td><td class="num">${HF.n(r.brier_score, 3)}</td><td class="num">${HF.pct(r.ece, 1)}</td><td class="num">${HF.pct(r.mce, 1)}</td><td class="num">${HF.n(r.sharpness, 3)}</td><td>${learned[`calibration:${r.scope}`] ? `<span class="badge q-A">${HF.esc(learned[`calibration:${r.scope}`].method)}</span>` : '<span class="muted">ninguna</span>'}</td></tr>`).join('')}</tbody></table>
    <p class="text-xs muted px-4 pb-3">Platt o isotónica se aplican solo si mejoran el Brier fuera de muestra (validación temporal) con ≥ ${report.params.minCalibrationSample} predicciones.</p>` : '<div class="empty">Se calcula al pulsar «Reaprender» con predicciones liquidadas.</div>';
  const st = Object.entries(bt.strategies).filter(([, v]) => v.totalBets);
  $('bt-meta').textContent = `Banca inicial ${bt.bankroll} u`;
  $('bt').innerHTML = st.length ? `<table class="t"><thead><tr><th>Estrategia</th><th>Apuestas</th><th>Ganadas</th><th>Perdidas</th><th>Stake</th><th>Beneficio</th><th>ROI</th><th>Yield</th><th>Drawdown máx.</th></tr></thead><tbody>${st.map(([k, v]) => `<tr><td>${HF.esc(k)}</td><td class="num">${v.totalBets}</td><td class="num">${v.wins}</td><td class="num">${v.losses}</td><td class="num">${HF.n(v.staked)}</td><td class="num ${v.profit >= 0 ? 'ok' : 'ko'}">${v.profit >= 0 ? '+' : ''}${HF.n(v.profit)}</td><td class="num">${HF.pct(v.roi, 1)}</td><td class="num">${HF.pct(v.yield, 1)}</td><td class="num">${HF.n(v.maxDrawdown)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">El backtesting necesita predicciones liquidadas con cuotas reales registradas.</div>';
  const tabs = [['daily', 'Diario'], ['weekly', 'Semanal'], ['monthly', 'Mensual']];
  $('mon-tabs').innerHTML = tabs.map(([k, l]) => `<button data-k="${k}" class="${monTab === k ? 'active' : ''}">${l}</button>`).join('');
  $('mon-tabs').querySelectorAll('button').forEach((b) => { b.onclick = () => { monTab = b.dataset.k; renderExtra(); }; });
  const mon = report.monitoring?.[monTab] || [];
  $('mon').innerHTML = mon.length ? `<table class="t"><thead><tr><th>Periodo</th><th>Predicciones</th><th>Accuracy</th><th>Brier</th><th>Log Loss</th><th>Picks con cuota</th><th>Yield</th><th>ROI</th></tr></thead><tbody>${mon.map((r) => `<tr><td>${HF.esc(r.period)}</td><td class="num">${r.n}</td><td class="num">${HF.pct(r.accuracy, 1)}</td><td class="num">${HF.n(r.brier, 3)}</td><td class="num">${HF.n(r.logLoss, 3)}</td><td class="num">${r.bets}</td><td class="num">${r.bets ? HF.pct(r.yield, 1) : '—'}</td><td class="num">${r.bets ? HF.pct(r.roi, 1) : '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin predicciones liquidadas.</div>';
  const th = report.trainingHistory || [];
  $('train').innerHTML = th.length ? `<table class="t"><thead><tr><th>Fecha</th><th>Modelo</th><th>Entreno</th><th>Validación</th><th>Brier</th><th>Brier base</th><th>Decisión</th></tr></thead><tbody>${th.map((r) => `<tr><td class="num">${HF.dateTime(r.finished_at)}</td><td>${HF.esc(r.model_name)}</td><td class="num">${r.training_samples}</td><td class="num">${r.validation_samples}</td><td class="num">${HF.n(r.brier, 4)}</td><td class="num">${HF.n(r.baseline_brier, 4)}</td><td>${r.adopted ? '<span class="ok">adoptado</span>' : '<span class="muted">sin cambios</span>'}<div class="text-xs muted">${HF.esc(r.reason || '')}</div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aún no se ha ejecutado «Reaprender».</div>';
}

async function action(path, label) {
  $('msg').textContent = `${label}…`;
  try {
    const r = await HF.api(path, { method: 'POST' });
    if (r.job) {
      for (;;) {
        await new Promise((res) => setTimeout(res, 1500));
        const j = await HF.api(`/jobs/${r.job.id}`);
        if (j.status !== 'running') { $('msg').textContent = j.status === 'done' ? `${label}: ${JSON.stringify(j.result)}` : `Error: ${j.error}`; break; }
      }
    } else $('msg').textContent = `${label}: ${JSON.stringify(r)}`;
  } catch (e) { $('msg').textContent = `Error: ${e.message}`; }
  load();
}

$('apply').onclick = load;
$('settle').onclick = () => action('/settle', 'Liquidación');
$('learn').onclick = () => action('/learn', 'Aprendizaje');
$('csv-pred').onclick = () => HF.exportCsv('predictions').catch((e) => { $('msg').textContent = e.message; });
$('csv-value').onclick = () => HF.exportCsv('value').catch((e) => { $('msg').textContent = e.message; });
HF.onTheme = () => report && drawCalibration();
load();
};
