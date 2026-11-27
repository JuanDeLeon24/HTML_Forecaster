const { test, expect } = require('playwright/test');
const path = require('node:path');

test('archivo único carga', async ({ page }) => {
  const file = 'file:///' + path.resolve('dist/HTML_Forecaster.html').replace(/\\/g, '/');
  await page.goto(file);
  await expect(page.locator('body')).toContainText('HTML_FORECASTER');
});