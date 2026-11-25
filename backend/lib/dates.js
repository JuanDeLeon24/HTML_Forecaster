'use strict';
const config = require('../config');

/** 'YYYY-MM-DD' de un timestamp unix (segundos) en la zona horaria indicada. */
function localDate(unixSeconds, tz = config.timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(unixSeconds * 1000));
}

function today(tz = config.timezone) {
  return localDate(Math.floor(Date.now() / 1000), tz);
}

function shiftDate(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isIsoDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

const nowSec = () => Math.floor(Date.now() / 1000);

module.exports = { localDate, today, shiftDate, isIsoDate, nowSec };
