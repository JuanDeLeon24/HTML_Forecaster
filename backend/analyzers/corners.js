'use strict';
const { countModel } = require('./countModel');

const CORNER_LINES = [7.5, 8.5, 9.5, 10.5, 11.5];

function cornersForecast(home, away, h2h) {
  return countModel(home, away, h2h.avgCorners, h2h.cornersN, CORNER_LINES, 'corners');
}

module.exports = { cornersForecast, CORNER_LINES };
