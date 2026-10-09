import { expect, test } from '@playwright/test';
import { cards, open } from './helpers';

test('malformed link portions are ignored with recovery messages', async ({ page }) => {
	await open(page, '/?v=1&fam=nope&res=req:abc&rev=req:5&cmp=a,b,c,d&zzz=1');
	await expect(page.getByText('Some link settings could not be used.')).toBeVisible();
	await expect(page.getByText(/unknown measurement family was ignored/)).toBeVisible();
	await expect(page.getByText(/Spatial resolution: the value must be/)).toBeVisible();
	await expect(page.getByText(/Unrecognised link settings were ignored: zzz/)).toBeVisible();
	await expect(page.getByLabel('Measurement family')).toHaveValue('All product families');
	await expect(page.locator('#criterion-revisit_days-value')).toHaveValue('5');
});

test('unresolved shortlist IDs stay as labelled placeholders, never substituted', async ({ page }) => {
	await open(page, '/shortlist?v=1&sl=mim-product:12,retired-product,landsat-c2-sr&cmp=mim-product:12,landsat-c2-sr');
	await expect(page.locator('li.entry')).toHaveCount(3);
	await expect(page.getByText('mim-product:12 — MIM record — MIM is not configured for this deployment.')).toBeVisible();
	await expect(page.getByText(/retired-product — Not found in the current catalogue/)).toBeVisible();
	await expect(page.getByText(/Not shown in the comparison because the record is not available: mim-product:12/)).toBeVisible();
	await open(page, '/products/mim-product:12?v=1');
	await expect(page.getByRole('heading', { name: 'Record not available' })).toBeVisible();
});

test('a shared link reproduces criteria and selections in a fresh session', async ({ browser }) => {
	const link = '/?v=1&fam=sr&rev=req:5&res=pref:30&sl=sentinel2-level2a,landsat-c2-sr&cmp=sentinel2-level2a,landsat-c2-sr&fields=technical';
	const context = await browser.newContext();
	const page = await context.newPage();
	await open(page, link);
	await expect(page.getByLabel('Measurement family')).toHaveValue('Surface Reflectance');
	await expect(page.getByRole('link', { name: /Shortlist & compare \(2\)/ })).toBeVisible();
	await expect(cards(page).first()).toBeVisible();
	await page.getByRole('link', { name: /Shortlist & compare \(2\)/ }).click();
	await expect(page.getByLabel('Technical characteristics')).toBeChecked();
	await expect(page.getByRole('rowheader', { name: /Elevation model/ })).toBeVisible();
	await context.close();
});

test('the deployed app makes no FedEO or third-party requests and exposes no credentials', async ({ page }) => {
	const requests: string[] = [];
	page.on('request', (request) => requests.push(request.url()));
	await open(page, '/?v=1&sl=landsat-c2-sr&cmp=landsat-c2-sr');
	await page.goto('/shortlist?v=1&sl=landsat-c2-sr,sentinel2-level2a&cmp=landsat-c2-sr,sentinel2-level2a');
	await expect(page.locator('body[data-hydrated="true"]')).toBeAttached();
	await page.goto('/products/landsat-c2-sr?v=1');
	await expect(page.locator('body[data-hydrated="true"]')).toBeAttached();
	expect(requests.filter((url) => !url.startsWith('http://127.0.0.1:4173'))).toEqual([]);
	expect(requests.some((url) => /fedeo/i.test(url))).toBe(false);
	const html = await page.content();
	expect(html).not.toMatch(/fedeo|MIMS_API_PASSWORD|Basic [A-Za-z0-9+/=]{8,}/i);
});
