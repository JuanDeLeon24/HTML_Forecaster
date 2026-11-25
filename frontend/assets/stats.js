/* Panel de resultados: métricas, calibración y parámetros aprendidos. */
HF.pages.stats = (root) => {
const $ = (id) => document.getElementById(id);
let chart = null;
let report = null;
root.innerHTML = `
  <section class="flex flex-wrap items-end gap-3">
    <div><h1 class="text-xl font-bold">Rendimiento del modelo</h1>
      <p class="text-sm muted">Calculado solo con predicciones liquidadas contra resultados reales.</p></div>
    <div class="ml-auto flex flex-wrap items-center gap-2 text-sm">
      <label>Desde <input type="date" id="from"></label>
      <label>Hasta <input type="date" id="to"></label>
      <select id="market"><option value="">Todos los mercados</option><option>1X2</option><option>DC</option><option>OU</option><option>BTTS</option><option>TEAM_OU</option><option>CORNERS</option><option>CARDS</option></select>
      <button class="btn" id="apply">Aplicar</button>
      <button class="btn btn-ghost" id="settle" title="Descarga resultados de partidos terminados y liquida predicciones">Liquidar resultados</button>
      <button class="btn btn-ghost" id="learn" title="Reajusta pesos del ensamble y ρ con los datos liquidados">Reaprender</button>
    </div>
  </section>
  <div id="msg" class="text-sm muted"></div>
  <section class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3" id="kpis"></section>
  <div class="grid lg:grid-cols-2 gap-5">
    <section class="panel"><div class="panel-h"><h2>Calibración</h2><span class="text-xs muted">ideal: puntos sobre la diagonal</span></div><div class="panel-b"><div style="height:300px"><canvas id="calib"></canvas></div></div></section>
    <section class="panel"><div class="panel-h"><h2>Por mercado</h2></div><div class="scroll-x" id="bymarket"></div></section>
  </div>
  <div class="grid lg:grid-cols-2 gap-5">
    <section class="panel"><div class="panel-h"><h2>1X2 (multiclase)</h2></div><div class="panel-b" id="mc"></div></section>
    <section class="panel"><div class="panel-h"><h2>Parámetros del modelo</h2></div><div class="panel-b" id="params"></div></section>
  </div>
  <section class="panel panel-b text-xs muted space-y-1">
    <div><b>Brier</b>: error cuadrático medio de la probabilidad (0 perfecto; 0.25 = decir 50% siempre). <b>Brier Skill</b>: mejora frente a predecir siempre la tasa base (&gt;0 aporta valor).</div>
    <div><b>Log Loss</b>: penaliza fuertemente la sobreconfianza. <b>RPS</b>: Ranked Probability Score del 1X2 (tiene en cuenta el orden 1 &lt; X &lt; 2).</div>
    <div><b>Accuracy / Precision / Recall / F1</b>: con umbral 50% («el modelo dijo que ocurría»). <b>ROI virtual</b>: 1 unidad por pick principal con cuota real registrada.</div>
  </section>`;

async function load() {
  const q = new URLSearchParams();
  if ($('from').value) q.set('from', $('from').value);
  if ($('to').value) q.set('to', $('to').value);
  if ($('market').value) q.set('market', $('market').value);
  try {
    report = await HF.api(`/performance?${q}`);
    render();
  } catch (e) { $('msg').textContent = `Error: ${e.message}`; }
}

function render() {
  const o = report.overall;
  const pk = report.picks;
  const roi = report.roi;
  if (!o.n) {
    $('kpis').innerHTML = '';
    $('msg').innerHTML = 'Todavía no hay predicciones liquidadas. Las métricas aparecerán cuando terminen los partidos pronosticados y se pulse «Liquidar resultados».';
  } else $('msg').textContent = `${o.n} predicciones binarias liquidadas · ${pk.n} picks principales.`;
  const k = [
    ['Predicciones', o.n ?? 0, 'liquidadas'], ['Brier', HF.n(o.brier, 3), `skill ${HF.n(o.brierSkill, 3)}`], ['Log Loss', HF.n(o.logLoss, 3), 'menor es mejor'],
    ['Accuracy', HF.pct(o.accuracy, 1), 'umbral 50%'], ['Precision', HF.pct(o.precision, 1), ''], ['Recall', HF.pct(o.recall, 1), ''], ['F1', HF.n(o.f1, 3), ''],
    ['ROI virtual', roi.roi === null ? '—' : HF.pct(roi.roi, 1), `${roi.bets} picks con cuota`],
  ];
  if (o.n) $('kpis').innerHTML = k.map(([l, v, s]) => `<div class="panel kpi"><div class="l">${l}</div><div class="v num">${v}</div><div class="text-xs muted">${s}</div></div>`).join('');

  const bm = Object.entries(report.byMarket);
  $('bymarket').innerHTML = bm.length ? `<table class="t"><thead><tr><th>Mercado</th><th>n</th><th>Brier</th><th>Skill</th><th>Log Loss</th><th>Acc.</th><th>F1</th><th>Media pred.</th><th>Observado</th></tr></thead><tbody>${bm.map(([m, x]) => `<tr><td>${HF.esc(m)}</td><td class="num">${x.n}</td><td class="num">${HF.n(x.brier, 3)}</td><td class="num ${x.brierSkill > 0 ? 'ok' : 'ko'}">${HF.n(x.brierSkill, 3)}</td><td class="num">${HF.n(x.logLoss, 3)}</td><td class="num">${HF.pct(x.accuracy, 1)}</td><td class="num">${HF.n(x.f1, 3)}</td><td class="num">${HF.pct(x.meanPredicted, 1)}</td><td class="num">${HF.pct(x.observedRate, 1)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin datos.</div>';

  const mc = report.result1X2;
  $('mc').innerHTML = mc.n ? `<table class="t"><tbody><tr><td>Partidos</td><td class="num">${mc.n}</td></tr><tr><td>Acierto del resultado más probable</td><td class="num">${HF.pct(mc.accuracy, 1)}</td></tr><tr><td>Brier multiclase</td><td class="num">${HF.n(mc.brier, 3)}</td></tr><tr><td>RPS</td><td class="num">${HF.n(mc.rps, 4)}</td></tr><tr><td>Log Loss</td><td class="num">${HF.n(mc.logLoss, 3)}</td></tr></tbody></table>` : '<div class="muted text-sm">Sin partidos 1X2 liquidados.</div>';

  const p = report.params;
  const learned = report.learnedHistory;
  $('params').innerHTML = `<table class="t"><tbody>
    <tr><td>Versión</td><td>${HF.esc(p.version)}</td></tr>
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
HF.onTheme = () => report && drawCalibration();
load();
};
