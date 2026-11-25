'use strict';
/** API REST de HTML_FORECASTER: adaptador Express sobre routes/handlers.js. */
const express = require('express');
const { createLogger } = require('../lib/logger');
const { dispatch } = require('./handlers');

const log = createLogger('api');
const router = express.Router();

router.use(express.json());
router.all('*', async (req, res) => {
  const r = await dispatch(req.method, req.path, req.query, req.body);
  if (r.error && r.status >= 500) log.error(`Error en ${req.method} ${req.path}`, r.error);
  res.status(r.status).json(r.body);
});

module.exports = router;
