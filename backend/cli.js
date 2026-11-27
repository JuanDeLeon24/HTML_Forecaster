'use strict';
/**
 * CLI:
 *   node backend/cli.js collect  [--date YYYY-MM-DD]   recolecta y pronostica
 *   node backend/cli.js forecast [--date YYYY-MM-DD]   recalcula pronósticos con los datos guardados
 *   node backend/cli.js settle                         liquida partidos terminados
 *   node backend/cli.js learn                          reajusta pesos / ρ con datos liquidados
 *   node backend/cli.js daily    [--date YYYY-MM-DD]   settle → learn → collect → forecast
 */
const services = require('./services');
const { today, isIsoDate } = require('./lib/dates');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cmd = process.argv[2];
  const date = arg('date') || today();
  if (!isIsoDate(date)) throw new Error('Fecha inválida, use YYYY-MM-DD');
  let last = 0;
  const progress = ({ done, total, label }) => {
    if (Date.now() - last > 2000 || done === total) { console.log(`  [${done}/${total}] ${label}`); last = Date.now(); }
  };
  let result;
  switch (cmd) {
    case 'collect': result = { collected: await services.collect(date, progress), forecasted: services.forecast(date) }; break;
    case 'forecast': result = services.forecast(date, { includeStarted: process.argv.includes('--include-started') }); break;
    case 'settle': result = await services.settle(); break;
    case 'learn': result = services.learn(); break;
    case 'daily': result = await services.daily(date, progress); break;
    default:
      console.log('Uso: node backend/cli.js <collect|forecast|settle|learn|daily> [--date YYYY-MM-DD]');
      process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
