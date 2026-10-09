import { expect, test } from '@playwright/test';
import { open } from './helpers';

// WebGL is switched off for the rest of the suite (playwright.config.ts); turn it back on here.
test.use({ launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {} });

test('with a fine pointer the purpose scene is drawn in WebGL and moves with the cursor', async ({ page }) => {
	test.slow();
	await page.setViewportSize({ width: 1280, height: 800 });
	await open(page);
	const hasWebGL = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl')));
	test.skip(!hasWebGL, 'This browser has no WebGL; the still image is used instead.');
	const canvas = page.locator('.backdrop canvas.visible');
	await expect(canvas).toHaveCount(1, { timeout: 15_000 });
	await page.mouse.move(40, 40);
	await page.waitForTimeout(1500);
	const before = await page.locator('.backdrop').screenshot();
	await page.mouse.move(1260, 780);
	await page.waitForTimeout(1500);
	const after = await page.locator('.backdrop').screenshot();
	expect(before.equals(after)).toBe(false);
	// Choosing a measurement crossfades within the scene; the canvas stays.
	await page.getByRole('button', { name: /^What do you want to do\?/ }).click();
	await page.getByRole('option', { name: /^monitor change/ }).click();
	await expect(canvas).toHaveCount(1);
});
