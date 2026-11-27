'use strict';
const config = require('../backend/config');
const { getProvider } = require('../backend/providers');
(async () => {
  const p = getProvider();
  console.log('Proveedor:', p.name);
  const today = new Date().toISOString().slice(0, 10);
  try {
    const m = await p.getScheduledMatches(today);
    console.log('Partidos hoy:', m.length);
    if (m.length) console.log(m[0].home.name, 'vs', m[0].away.name);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();