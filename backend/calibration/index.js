'use strict';
/**
 * Sistema de calibración.
 * Métricas: Brier, LogLoss, ECE (error de calibración esperado), MCE (máximo), Sharpness.
 * Corrección automática por mercado: se comparan {sin corrección, Platt, Isotónica} con
 * validación walk-forward (ajuste con el 70% más antiguo, evaluación con el 30% más reciente).
 * Solo se adopta un método si mejora el Brier fuera de muestra de forma consistente
 * (mejora media > 1 error estándar del diferencial pareado y ≥ 0.0005 de Brier, relevancia
 * práctica) y hay muestra suficiente.
 */
const { fitIsotonic, applyIsotonic } = require('./isotonic');
const { fitPlatt, applyPlatt } = require('./platt');

function calibrationError(rows, bins = 10) {
  const b = Array.from({ length: bins }, () => ({ n: 0, p: 0, o: 0 }));
  for (const r of rows) {
    const i = Math.min(bins - 1, Math.floor(r.probability * bins));
    b[i].n++; b[i].p += r.probability; b[i].o += r.outcome;
  }
  let ece = 0, mce = 0;
  const n = rows.length;
  for (const x of b) {
    if (!x.n) continue;
    const gap = Math.abs(x.p / x.n - x.o / x.n);
    ece += (x.n / n) * gap;
    mce = Math.max(mce, gap);
  }
  return n ? { ece, mce } : { ece: null, mce: null };
}

/** Sharpness: cuán decididas son las probabilidades = media de |p − 0.5|·2 (0 = siempre 50%, 1 = siempre 0/100%). */
function sharpness(rows) {
  return rows.length ? rows.reduce((s, r) => s + Math.abs(r.probability - 0.5) * 2, 0) / rows.length : null;
}

function sharpnessDistribution(rows, bins = 10) {
  const h = Array(bins).fill(0);
  for (const r of rows) h[Math.min(bins - 1, Math.floor(r.probability * bins))]++;
  return h.map((n, i) => ({ from: i / bins, to: (i + 1) / bins, n }));
}

function apply(model, p) {
  if (!model || model.method === 'none') return p;
  return model.method === 'platt' ? applyPlatt(model, p) : applyIsotonic(model, p);
}

const FITTERS = { platt: fitPlatt, isotonic: fitIsotonic };

/**
 * @param points [{p, o, t}] ordenados o no; t = instante del partido
 * @returns { method, model, n, holdout: {...}, adopted, reason }
 */
function chooseCalibration(points, { minSample = 300, holdoutFraction = 0.3, minGain = 0.0005 } = {}) {
  const pts = points.slice().sort((a, b) => a.t - b.t);
  if (pts.length < minSample) return { adopted: false, method: 'none', n: pts.length, reason: `muestra insuficiente (${pts.length} < ${minSample})` };
  const cut = Math.floor(pts.length * (1 - holdoutFraction));
  const train = pts.slice(0, cut);
  const test = pts.slice(cut);
  const base = test.map((x) => (x.p - x.o) ** 2);
  const results = {};
  let best = null;
  for (const [name, fit] of Object.entries(FITTERS)) {
    const m = fit(train);
    const d = test.map((x, i) => base[i] - (apply(m, x.p) - x.o) ** 2);
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, d.length - 1));
    const se = sd / Math.sqrt(d.length);
    results[name] = { improvement: mean, se, t: se > 0 ? mean / se : 0 };
    if (mean >= minGain && results[name].t >= 1 && (!best || mean > results[best].improvement)) best = name;
  }
  const holdout = { train: train.length, test: test.length, brierNone: base.reduce((a, b) => a + b, 0) / base.length, candidates: results };
  if (!best) return { adopted: false, method: 'none', n: pts.length, holdout, reason: 'ningún método mejora de forma consistente fuera de muestra' };
  // Validado: se reajusta con TODOS los datos disponibles (todos anteriores a los partidos futuros)
  return { adopted: true, method: best, model: FITTERS[best](pts), n: pts.length, holdout, reason: `mejora Brier fuera de muestra ${results[best].improvement.toFixed(5)} (t=${results[best].t.toFixed(2)})` };
}

module.exports = { calibrationError, sharpness, sharpnessDistribution, apply, chooseCalibration };
