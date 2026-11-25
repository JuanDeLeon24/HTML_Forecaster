/* Panel de resultados: métricas, calibración y parámetros aprendidos. */
(() => {
HF.header('stats');
const $ = (id) => document.getElementById(id);
let chart = null;
let report = null;

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
document.addEventListener('hf-theme', () => report && drawCalibration());
load();
})();
