'use strict';
/**
 * Nivel 3 y 4 – Poisson bivariado independiente con corrección Dixon-Coles (1997).
 *
 * P(X=x, Y=y) = τ(x,y) · Pois(x; λh) · Pois(y; λa)
 *   τ(0,0) = 1 − λh·λa·ρ   τ(0,1) = 1 + λh·ρ   τ(1,0) = 1 + λa·ρ   τ(1,1) = 1 − ρ
 * ρ < 0 aumenta 0-0 y 1-1 (los marcadores bajos que Poisson puro subestima).
 */
const { poissonPmf, clamp } = require('../lib/math');

function tau(x, y, lh, la, rho) {
  if (x === 0 && y === 0) return 1 - lh * la * rho;
  if (x === 0 && y === 1) return 1 + lh * rho;
  if (x === 1 && y === 0) return 1 + la * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/** Matriz de probabilidades de marcador [golesLocal][golesVisitante], normalizada. */
function scoreMatrix(lambdaHome, lambdaAway, { rho = 0, maxGoals = 10 } = {}) {
  // ρ debe mantener τ ≥ 0
  const rhoMin = Math.max(-1 / lambdaHome, -1 / lambdaAway);
  const rhoMax = Math.min(1 / (lambdaHome * lambdaAway), 1);
  const r = clamp(rho, rhoMin, rhoMax);
  const m = [];
  let total = 0;
  for (let x = 0; x <= maxGoals; x++) {
    m[x] = [];
    for (let y = 0; y <= maxGoals; y++) {
      const p = tau(x, y, lambdaHome, lambdaAway, r) * poissonPmf(x, lambdaHome) * poissonPmf(y, lambdaAway);
      m[x][y] = Math.max(0, p);
      total += m[x][y];
    }
  }
  for (let x = 0; x <= maxGoals; x++) for (let y = 0; y <= maxGoals; y++) m[x][y] /= total;
  return m;
}

/** Suma de la matriz sobre las celdas que cumplen `pred(h, a)`. */
function prob(matrix, pred) {
  let p = 0;
  for (let x = 0; x < matrix.length; x++) for (let y = 0; y < matrix[x].length; y++) if (pred(x, y)) p += matrix[x][y];
  return p;
}

/** Mercados derivados de la matriz. */
function marketsFromMatrix(m) {
  const home = prob(m, (h, a) => h > a);
  const draw = prob(m, (h, a) => h === a);
  const away = prob(m, (h, a) => h < a);
  const over = {};
  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5]) over[line] = prob(m, (h, a) => h + a > line);
  const teamOver = { home: {}, away: {} };
  for (const line of [0.5, 1.5, 2.5]) {
    teamOver.home[line] = prob(m, (h) => h > line);
    teamOver.away[line] = prob(m, (_h, a) => a > line);
  }
  const btts = prob(m, (h, a) => h > 0 && a > 0);
  const scores = [];
  for (let x = 0; x < m.length; x++) for (let y = 0; y < m[x].length; y++) scores.push({ score: `${x}-${y}`, home: x, away: y, p: m[x][y] });
  scores.sort((a, b) => b.p - a.p);
  return {
    '1X2': { 1: home, X: draw, 2: away },
    DC: { '1X': home + draw, X2: draw + away, 12: home + away },
    over, btts,
    cleanSheet: { home: prob(m, (_h, a) => a === 0), away: prob(m, (h) => h === 0) },
    teamOver,
    expectedGoals: { home: prob2(m, 'h'), away: prob2(m, 'a') },
    topScores: scores.slice(0, 12),
  };
}

function prob2(m, side) {
  let e = 0;
  for (let x = 0; x < m.length; x++) for (let y = 0; y < m[x].length; y++) e += (side === 'h' ? x : y) * m[x][y];
  return e;
}

/**
 * Estimación de ρ por máxima verosimilitud (búsqueda en rejilla) sobre partidos
 * con λ conocidos (pronósticos ya liquidados). Devuelve null si no hay muestra.
 */
function fitRho(samples, { grid = [-0.2, 0, 0.005], minSamples = 150 } = {}) {
  if (samples.length < minSamples) return null;
  let best = null;
  for (let rho = grid[0]; rho <= grid[1] + 1e-9; rho += grid[2]) {
    let ll = 0;
    for (const s of samples) {
      const t = tau(s.homeGoals, s.awayGoals, s.lambdaHome, s.lambdaAway, rho);
      if (t <= 0) { ll = -Infinity; break; }
      ll += Math.log(t);
    }
    if (!best || ll > best.ll) best = { rho: Math.round(rho * 1000) / 1000, ll };
  }
  return best;
}

module.exports = { scoreMatrix, marketsFromMatrix, prob, tau, fitRho };
