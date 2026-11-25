'use strict';
/**
 * Catálogo de mercados: etiqueta legible, familia y regla de liquidación.
 * Un "leg" es { market, selection, line }.
 */

const FAMILY = { '1X2': 'result', DC: 'result', OU: 'goals', BTTS: 'btts', TEAM_OU: 'teamgoals', CORNERS: 'corners', CARDS: 'cards' };

function label({ market, selection, line }, names = { home: 'Local', away: 'Visitante' }) {
  switch (market) {
    case '1X2': return selection === '1' ? `Gana ${names.home}` : selection === '2' ? `Gana ${names.away}` : 'Empate';
    case 'DC': return { '1X': `${names.home} o empate (1X)`, X2: `Empate o ${names.away} (X2)`, 12: 'No hay empate (12)' }[selection];
    case 'OU': return `${selection === 'over' ? 'Más' : 'Menos'} de ${line} goles`;
    case 'BTTS': return selection === 'yes' ? 'Ambos anotan: Sí' : 'Ambos anotan: No';
    case 'TEAM_OU': return `${selection === 'home' ? names.home : names.away} más de ${line} goles`;
    case 'CORNERS': return `${selection === 'over' ? 'Más' : 'Menos'} de ${line} corners`;
    case 'CARDS': return `${selection === 'over' ? 'Más' : 'Menos'} de ${line} tarjetas`;
    default: return `${market} ${selection} ${line ?? ''}`;
  }
}

/** Predicado sobre el marcador (h, a) para mercados de goles; null si no aplica. */
function scorePredicate({ market, selection, line }) {
  switch (market) {
    case '1X2': return selection === '1' ? (h, a) => h > a : selection === 'X' ? (h, a) => h === a : (h, a) => h < a;
    case 'DC': return selection === '1X' ? (h, a) => h >= a : selection === 'X2' ? (h, a) => h <= a : (h, a) => h !== a;
    case 'OU': return selection === 'over' ? (h, a) => h + a > line : (h, a) => h + a < line;
    case 'BTTS': return selection === 'yes' ? (h, a) => h > 0 && a > 0 : (h, a) => h === 0 || a === 0;
    case 'TEAM_OU': return selection === 'home' ? (h) => h > line : (_h, a) => a > line;
    default: return null;
  }
}

/**
 * Liquida un leg con el resultado real.
 * @param result { homeGoals, awayGoals, corners: total|null, cards: total|null }
 * @returns 1 | 0 | null (null = no se puede liquidar por falta de dato real → se anula)
 */
function settle(leg, result) {
  const pred = scorePredicate(leg);
  if (pred) return pred(result.homeGoals, result.awayGoals) ? 1 : 0;
  const total = leg.market === 'CORNERS' ? result.corners : leg.market === 'CARDS' ? result.cards : null;
  if (total === null || total === undefined) return null;
  return (leg.selection === 'over' ? total > leg.line : total < leg.line) ? 1 : 0;
}

const legKey = (l) => `${l.market}|${l.selection}|${l.line ?? 0}`;

module.exports = { FAMILY, label, scorePredicate, settle, legKey };
