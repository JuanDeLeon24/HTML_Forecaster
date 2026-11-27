'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bivariateMatrix, bivariatePmf } = require('../backend/models/bivariate');

test('bivariado suma 1', () => {
  const m = bivariateMatrix(1.2, 1.0, 0.3, 8);
  const total = m.flat().reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-6);
});

test('bivariado l3=0 equivale a Poisson independiente', () => {
  const p = bivariatePmf(1, 1, 1.2, 1.0, 0);
  const poisson = require('../backend/lib/math').poissonPmf;
  assert.ok(Math.abs(p - poisson(1, 1.2) * poisson(1, 1.0)) < 1e-9);
});