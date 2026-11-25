'use strict';
/** Gestor mínimo de tareas en segundo plano (una a la vez por tipo) con progreso consultable. */
const { createLogger } = require('./logger');

const log = createLogger('jobs');
const jobs = new Map();
let seq = 0;

function start(kind, fn) {
  const running = [...jobs.values()].find((j) => j.kind === kind && j.status === 'running');
  if (running) return { job: running, alreadyRunning: true };
  const job = { id: ++seq, kind, status: 'running', startedAt: Date.now(), progress: null, result: null, error: null };
  jobs.set(job.id, job);
  Promise.resolve()
    .then(() => fn((p) => { job.progress = p; }))
    .then((r) => { job.status = 'done'; job.result = r; })
    .catch((err) => { job.status = 'error'; job.error = err.message; log.error(`Job ${kind} falló`, err); })
    .finally(() => { job.finishedAt = Date.now(); });
  return { job, alreadyRunning: false };
}

const get = (id) => jobs.get(Number(id)) ?? null;
const list = () => [...jobs.values()].slice(-20).reverse();

module.exports = { start, get, list };
