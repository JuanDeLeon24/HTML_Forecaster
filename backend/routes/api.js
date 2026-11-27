'use strict';
/**
 * API REST de HTML_FORECASTER: adaptador Express sobre routes/handlers.js.
 * Seguridad (servidor local):
 *  - API_TOKEN (opcional, .env): si existe, las acciones (POST) exigen la cabecera
 *    `Authorization: Bearer <token>` o `X-API-Token`.
 *  - Límite de peticiones por IP: 120/min en lectura y 10/min en acciones.
 *  - Auditoría: cada acción queda en logs/system.log con IP y resultado.
 */
const crypto = require('node:crypto');
const express = require('express');
const { createLogger } = require('../lib/logger');
const { dispatch } = require('./handlers');

const log = createLogger('api');
const router = express.Router();
const TOKEN = process.env.API_TOKEN || '';
const buckets = new Map();

function rateLimited(ip, kind, limit) {
  const key = `${ip}|${kind}`;
  const now = Date.now();
  // Limpieza periódica para que el mapa no crezca sin límite
  if (buckets.size > 1000) for (const [k, v] of buckets) if (now - v.start > 60000) buckets.delete(k);
  const b = buckets.get(key) || { start: now, n: 0 };
  if (now - b.start > 60000) { b.start = now; b.n = 0; }
  b.n++;
  buckets.set(key, b);
  return b.n > limit;
}

router.use(express.json({ limit: '1mb' }));
router.all('*', async (req, res) => {
  const action = req.method !== 'GET';
  if (rateLimited(req.ip, action ? 'action' : 'read', action ? 10 : 120)) return res.status(429).json({ error: 'Demasiadas peticiones; espera un minuto.' });
  if (action && TOKEN) {
    const given = (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.get('x-api-token') || '';
    const a = Buffer.from(String(given));
    const b = Buffer.from(TOKEN);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { log.warn('Acción rechazada (token inválido)', { ip: req.ip, path: req.path }); return res.status(401).json({ error: 'Token de API requerido' }); }
  }
  const r = await dispatch(req.method, req.path, req.query, req.body);
  if (action) log.info('Auditoría', { ip: req.ip, method: req.method, path: req.path, status: r.status });
  if (r.error && r.status >= 500) log.error(`Error en ${req.method} ${req.path}`, { error: r.error.message, endpoint: req.path, impact: 'petición fallida' });
  res.status(r.status).json(r.body);
});

module.exports = router;
