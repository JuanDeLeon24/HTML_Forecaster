'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { train, predict } = require('../backend/models/logistic');

test('logística separa clases linealmente', () => {
  const X = [[0], [0.1], [0.9], [1.0]];
  const y = [0, 0, 1, 1];
  const m = train(X, y, { epochs: 2000 });
  const p = predict(m, [[0.05], [0.95]]);
  assert.ok(p[0] < 0.5 && p[1] > 0.5);
});