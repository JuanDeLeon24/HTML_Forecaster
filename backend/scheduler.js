'use strict';
/**
 * Planificador interno opcional (SCHEDULER_ENABLED=1):
 *  - cada 3 h: liquidar resultados pendientes
 *  - una vez al día (06:00 hora local): ciclo completo del día
 * Alternativa recomendada en servidores: cron del sistema con `npm run daily`.
 */
const services = require('./services');
const jobs = require('./lib/jobs');
const { today } = require('./lib/dates');
const { createLogger } = require('./lib/logger');
const { backupNow } = require('./lib/backup');
const { getDb } = require('./database/db');
const config = require('./config');
const { sendWhatsApp, buildTopMessage } = require('./lib/whatsapp');
const { buildRankings } = require('./engine/ranking');

const log = createLogger('scheduler');
let lastDaily = null;

function hourLocal() {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, hour: '2-digit', hour12: false }).format(new Date()));
}

function startScheduler() {
  log.info('Planificador activo');
  // Tras liquidar se ejecuta el aprendizaje continuo (métricas, calibración, pesos con sus reglas de seguridad)
  setInterval(() => jobs.start('settle', async () => ({ settled: await services.settle(), learned: services.learn() })), 3 * 3600 * 1000);
  const backup = () => { try { backupNow(getDb().conn); } catch (e) { log.error('Fallo de copia de seguridad', { error: e.message, impact: 'sin copia hoy' }); } };
  backup();
  setInterval(backup, 6 * 3600 * 1000);
  setInterval(() => {
    const d = today();
    if (lastDaily !== d && hourLocal() >= 6) {
      lastDaily = d;
      jobs.start('daily', async (p) => {
        const r = await services.daily(d, p);
        // Envío automático del Top 10 por WhatsApp (WHATSAPP_ENABLED=1 y WHATSAPP_AUTO=1)
        if (config.whatsapp.enabled && config.whatsapp.autoSend) {
          try {
            const [from, to] = services.dayRange(d);
            await sendWhatsApp(buildTopMessage(buildRankings(services.getRepos().forecastsBetween(from, to), 10), d));
          } catch (e) { log.error('Fallo enviando WhatsApp', { error: e.message, impact: 'resumen diario no enviado' }); }
        }
        return r;
      });
    }
  }, 10 * 60 * 1000);
}

module.exports = { startScheduler };
