import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { open } from './helpers';

const pages = [
	['discover', '/?v=1&fam=sr&res=req:10&rev=req:5'],
	['shortlist', '/shortlist?v=1&rev=req:5&sl=landsat-c2-sr,sentinel2-level2a,enmap-l2a&cmp=landsat-c2-sr,sentinel2-level2a&fields=technical,provenance'],
	['detail', '/products/sentinel2-level2a?v=1&rev=req:5']
] as const;

for (const theme of ['light', 'dark'] as const) {
	for (const [name, path] of pages) {
		test(`${name} has no automatically detectable accessibility violations (${theme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme: theme });
			await open(page, path);
			if (name === 'discover') {
				await page.getByRole('button', { name: /^Show \d/ }).first().click();
				await page.getByRole('button', { name: /More filters/ }).click();
			}
			const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
			const summary = results.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
			expect(summary).toEqual([]);
			await page.screenshot({ path: `test-results/screens/${name}-${theme}.png`, fullPage: true });
		});
	}
}

test('keyboard-only: discover, shortlist, compare and reach an access link', async ({ page }) => {
	await open(page, '/?v=1');
	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
	await page.getByLabel('Search product and mission names').focus();
	await page.keyboard.type('sentinel-2');
	await page.waitForTimeout(600);
	const add = page.getByRole('button', { name: 'Add to shortlist Sentinel-2 Level-2A' });
	await add.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: /On shortlist Sentinel-2 Level-2A/ })).toBeFocused();
	await page.getByLabel('Search product and mission names').fill('');
	await page.keyboard.type('landsat collection 2 surface reflectance');
	await page.waitForTimeout(600);
	await page.getByRole('button', { name: 'Add to shortlist Landsat Collection 2 Surface Reflectance' }).focus();
	await page.keyboard.press('Enter');
	await page.getByRole('link', { name: /Shortlist & compare \(2\)/ }).focus();
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Compare Sentinel-2 Level-2A' }).focus();
	await page.keyboard.press('Space');
	await page.getByRole('button', { name: 'Compare Landsat Collection 2 Surface Reflectance' }).focus();
	await page.keyboard.press('Space');
	const access = page.getByRole('table').getByRole('link', { name: /Access data.*Sentinel-2/ });
	await access.focus();
	await expect(access).toBeFocused();
	const outline = await access.evaluate((element) => getComputedStyle(element).outlineStyle);
	expect(outline).not.toBe('none');
});

test('narrow screen and 200% zoom keep controls usable without page-level horizontal scrolling', async ({ browser }) => {
	for (const viewport of [
		{ width: 390, height: 844 },
		{ width: 640, height: 450 }
	]) {
		const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
		const page = await context.newPage();
		await open(page, '/?v=1&rev=req:5');
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
		await page.getByRole('button', { name: /Search, criteria and profiles/ }).click();
		await expect(page.getByLabel('Search product and mission names')).toBeVisible();
		await page.screenshot({ path: `test-results/screens/discover-${viewport.width}.png` });
		await page.goto('/shortlist?v=1&sl=landsat-c2-sr,sentinel2-level2a,enmap-l2a&cmp=landsat-c2-sr,sentinel2-level2a,enmap-l2a');
		await expect(page.locator('body[data-hydrated="true"]')).toBeAttached();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
		// The comparison scrolls inside its own labelled region; row headers stay associated.
		await expect(page.getByRole('region', { name: /Side-by-side comparison/ })).toBeVisible();
		await expect(page.getByRole('rowheader', { name: /Nominal revisit/ }).first()).toBeVisible();
		await page.screenshot({ path: `test-results/screens/shortlist-${viewport.width}.png`, fullPage: true });
		await context.close();
	}
});
