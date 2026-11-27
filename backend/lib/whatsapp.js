'use strict';
/** Envío del resumen diario por WhatsApp (Meta Cloud API o Twilio). Opcional: WHATSAPP_ENABLED=1. */
const config = require('../config');

async function sendMeta(text) {
  const { token, phoneId, to } = config.whatsapp.meta;
  if (!token || !phoneId || !to) throw new Error('WhatsApp Meta no configurado');
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  });
  if (!res.ok) throw new Error(`WhatsApp Meta HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sendTwilio(text) {
  const { sid, token, from, to } = config.whatsapp.twilio;
  if (!sid || !token || !from || !to) throw new Error('WhatsApp Twilio no configurado');
  const body = new URLSearchParams({ From: from, To: to, Body: text });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Twilio HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sendWhatsApp(text) {
  if (!config.whatsapp.enabled) throw new Error('WhatsApp deshabilitado (WHATSAPP_ENABLED=1)');
  if (config.whatsapp.provider === 'twilio') return sendTwilio(text);
  return sendMeta(text);
}

/** Resumen diario: Top por confianza (con nivel A+…D) y apuestas de valor aceptadas. */
function buildTopMessage(rankings, date = '', limit = 10) {
  const pct = (p) => `${Math.round(p * 100)}%`;
  const items = (rankings?.confidence || []).slice(0, limit);
  const lines = [`⚽ HTML_FORECASTER ${date}`.trim(), '', '🏆 Mayor confianza:'];
  items.forEach((r, i) => lines.push(`${i + 1}. ${r.match} · ${r.label} · ${pct(r.probability)} · ${r.confidenceGrade ?? r.quality}`));
  if (!items.length) lines.push('Sin pronósticos disponibles.');
  const value = (rankings?.value || []).slice(0, 5);
  if (value.length) {
    lines.push('', '💰 Valor (EV+ que superó los filtros):');
    value.forEach((v) => lines.push(`• ${v.match} · ${v.label} @ ${v.odds} · EV +${pct(v.ev)}${v.stake ? ` · stake ${v.stake}` : ''}`));
  }
  lines.push('', 'Probabilidades estadísticas, no certezas.');
  return lines.join('\n');
}

module.exports = { sendWhatsApp, buildTopMessage };
