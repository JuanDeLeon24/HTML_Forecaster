'use strict';
const path = require('node:path');
const express = require('express');
const config = require('./config');
const { createLogger } = require('./lib/logger');
const api = require('./routes/api');
const { startScheduler } = require('./scheduler');

const log = createLogger('server');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, _res, next) => { if (req.path.startsWith('/api')) log.debug(`${req.method} ${req.originalUrl}`); next(); });
  app.use('/api', api);
  app.use(express.static(path.join(config.root, 'frontend'), { extensions: ['html'] }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) log.error('Error no controlado', err);
    res.status(status).json({ error: err.message || 'Error interno' });
  });
  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(config.port, config.host, () => {
    log.info(`HTML_FORECASTER escuchando en http://${config.host}:${config.port} (zona ${config.timezone}, proveedor ${config.provider})`);
    if (config.scheduler.enabled) startScheduler();
  });
}

module.exports = { createApp };
