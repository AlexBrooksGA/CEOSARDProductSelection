import { expect, test, type Page } from '@playwright/test';
import { card, cards, open } from './helpers';

// One Node process holds a process-local MIM cache, so these steps run in order.
test.describe.configure({ mode: 'serial' });

const control = (mode: string) => fetch(`http://127.0.0.1:4599/__control?mode=${mode}`, { method: 'POST' });

async function includeMim(page: Page) {
	await page.getByLabel(/Include product records from CEOS Missions/).check();
}

test('upstream failure leaves the curated catalogue usable with a clear message', async ({ page }) => {
	await control('fail');
	await open(page);
	await includeMim(page);
	await page.getByRole('button', { name: 'Load MIM products' }).click();
	await expect(page.getByText('The MIM service returned an error. The curated catalogue remains available.').first()).toBeVisible();
	await expect(cards(page)).toHaveCount(26);
	await control('ok');
});

test('loading MIM never relaxes filters; hidden records are explained with an explicit broaden action', async ({ page }) => {
	const requests: string[] = [];
	page.on('request', (request) => requests.push(request.url()));
	await open(page, '/?v=1&res=pref:30');
	await includeMim(page);
	await page.getByRole('button', { name: 'Load MIM products' }).click();
	await expect(page.getByText(/30 MIM product records loaded/).first()).toBeVisible();
	await expect(page.getByLabel('Catalogue scope')).toHaveValue('CEOS-ARD assessed only');
	await expect(page).toHaveURL(/res=pref(%3A|:)30/);
	await expect(page.getByText('28 of 30 loaded MIM records are hidden by the current scope or filters', { exact: false })).toBeVisible();
	// Two MIM products carry both CEOS-ARD link status and certification evidence.
	await expect(cards(page)).toHaveCount(28);
	await expect(card(page, 'E2E Optical 10m SR')).toContainText('MIM record');
	await page.getByRole('button', { name: 'Show all available statuses' }).click();
	await expect(page.getByLabel('Catalogue scope')).toHaveValue('All statuses');
	// Display limit: 24 MIM cards rendered, all counted.
	await expect(page.locator('article.card', { hasText: 'MIM record' })).toHaveCount(24);
	await expect(page.getByText('Showing 24 of 30 matching MIM records')).toBeVisible();
	await page.getByRole('button', { name: 'Show all' }).click();
	await expect(page.locator('article.card', { hasText: 'MIM record' })).toHaveCount(30);
	// Instrument resolution is a labelled display fallback and the browser never calls MIM directly.
	await expect(card(page, 'E2E Product 02')).toContainText('Finest instrument resolution');
	await expect(card(page, 'E2E Product 02')).toContainText('display only');
	expect(requests.filter((url) => !url.startsWith('http://127.0.0.1:4174'))).toEqual([]);
});

test('refresh is limited by a cooldown and only affects MIM data', async ({ page }) => {
	await open(page, '/?v=1&mim=1&scope=all&fam=sr');
	// A new session loads from the server cache (no upstream call), then offers Refresh.
	await page.getByRole('button', { name: 'Load MIM products' }).click();
	await expect(page.getByRole('button', { name: 'Refresh MIM data' })).toBeVisible();
	await page.getByRole('button', { name: 'Refresh MIM data' }).click();
	await expect(page.getByText(/MIM data was requested recently/).first()).toBeVisible();
	await expect(page.getByLabel('Measurement family')).toHaveValue('Surface Reflectance');
});

test('shared links with MIM IDs show placeholders until MIM is deliberately loaded', async ({ browser }) => {
	const context = await browser.newContext();
	const page = await context.newPage();
	await open(page, '/shortlist?v=1&sl=mim-product:900,landsat-c2-sr&cmp=mim-product:900,landsat-c2-sr');
	await expect(page.getByText(/mim-product:900 — MIM record — MIM products are not loaded in this session/)).toBeVisible();
	await page.getByRole('button', { name: 'Load MIM products' }).click();
	await expect(page.getByRole('table', { name: /comparison of 2 products/ })).toBeVisible();
	await expect(page.getByRole('columnheader', { name: /E2E Optical 10m SR/ })).toBeVisible();
	// Session restore re-uses the server cache without a new upstream request.
	const before = await (await fetch('http://127.0.0.1:4599/__stats')).json();
	await page.reload();
	await expect(page.getByRole('columnheader', { name: /E2E Optical 10m SR/ })).toBeVisible();
	const after = await (await fetch('http://127.0.0.1:4599/__stats')).json();
	expect(after.requests).toBe(before.requests);
	await page.goto('/products/mim-product:900?v=1');
	await expect(page.getByRole('heading', { level: 1, name: 'E2E Optical 10m SR' })).toBeVisible();
	await expect(page.getByText('10 m (reported in API product name)')).toBeVisible();
	await context.close();
});
