'use strict';
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

function buildTopMessage(rankings, limit = 10) {
  const items = (rankings?.confidence || []).slice(0, limit);
  const lines = ['🏆 Mejores oportunidades (por confianza):'];
  items.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.match} - ${r.label} (${Math.round(r.confidence * 100)}%) [${r.quality}]`);
  });
  if (!items.length) lines.push('Sin pronósticos disponibles.');
  return lines.join('\n');
}

module.exports = { sendWhatsApp, buildTopMessage };
