'use strict';
/**
 * Tarjetas = amarillas + rojas mostradas (cada tarjeta cuenta 1).
 * Limitación conocida: no se modela todavía al árbitro (Fase 3).
 */
const { countModel } = require('./countModel');

const CARD_LINES = [2.5, 3.5, 4.5, 5.5];

function cardsForecast(home, away, h2h) {
  return countModel(home, away, h2h.avgCards, h2h.cardsN, CARD_LINES, 'cards');
}

module.exports = { cardsForecast, CARD_LINES };
