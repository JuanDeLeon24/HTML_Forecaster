'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMatch, validateStats, validateOdds, ValidationError } = require('../backend/lib/validate');

test('validateMatch acepta partido válido', () => {
  validateMatch({ id: 'e:1', provider: 'x', startTime: 100, status: 'notstarted', home: { id: 't:1' }, away: { id: 't:2' }, homeGoals: null, awayGoals: null });
  assert.ok(true);
});

test('validateMatch rechaza goals negativos', () => {
  assert.throws(() => validateMatch({ id: 'e:1', provider: 'x', startTime: 100, status: 'notstarted', home: { id: 't:1' }, away: { id: 't:2' }, homeGoals: -1 }), ValidationError);
});

test('validateStats rechaza NaN/Infinity', () => {
  assert.throws(() => validateStats({ available: true, homeCorners: NaN }), ValidationError);
  assert.throws(() => validateStats({ available: true, homeCorners: Infinity }), ValidationError);
});

test('validateOdds rechaza cuota <= 1', () => {
  assert.throws(() => validateOdds({ market: '1X2', selection: '1', decimalOdds: 1 }), ValidationError);
  validateOdds({ market: '1X2', selection: '1', decimalOdds: 2.1, line: 0 });
  assert.ok(true);
});