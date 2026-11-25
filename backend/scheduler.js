'use strict';
/**
 * Planificador interno opcional (SCHEDULER_ENABLED=1):
 *  - cada 3 h: liquidar resultados pendientes
 *  - una vez al día (06:00 hora local): ciclo completo del día
 * Alternativa recomendada en servidores: cron del sistema con `npm run daily`.
 */
const config = require('./config');
const services = require('./services');
const jobs = require('./lib/jobs');
const { today } = require('./lib/dates');
const { createLogger } = require('./lib/logger');

const log = createLogger('scheduler');
let lastDaily = null;

function hourLocal() {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, hour: '2-digit', hour12: false }).format(new Date()));
}

function startScheduler() {
  log.info('Planificador activo');
  setInterval(() => jobs.start('settle', () => services.settle()), 3 * 3600 * 1000);
  setInterval(() => {
    const d = today();
    if (lastDaily !== d && hourLocal() >= 6) {
      lastDaily = d;
      jobs.start('daily', (p) => services.daily(d, p));
    }
  }, 10 * 60 * 1000);
}

module.exports = { startScheduler };
