import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test } from '@playwright/test';
import { open } from './helpers';

// CEOS MIM database values come from the committed snapshot, so these run with MIM turned off.

test('product page shows a MIM missions and instruments panel with purple asterisks and a source footnote', async ({ page }) => {
	await open(page, '/products/landsat-c2-sr?v=1');
	const panel = page.locator('section[aria-labelledby="mim-heading"]');
	await expect(panel.getByRole('heading', { level: 2, name: /Missions and instruments/ })).toBeVisible();
	await expect(panel.getByRole('heading', { name: /^Landsat 8/ })).toBeVisible();
	await expect(panel.getByText('2013-02-11')).toBeVisible();
	await expect(panel.locator('.mim-legend')).toContainText('Every value in this section is from the CEOS MIM database');
	// Inside the panel the asterisks are decorative: the legend says it once for screen readers.
	await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Missions and instruments*');
	const mark = panel.locator('.mim-mark').first();
	// The asterisk is purple (the --mim token), not the text colour.
	const colour = await mark.evaluate((el) => getComputedStyle(el).color);
	expect(colour).toBe('rgb(124, 58, 237)');
	const footnote = page.locator('.mim-footnote');
	await expect(footnote).toContainText('CEOS MIM Database, https://database.eohandbook.com');
	await expect(footnote).toContainText(/edition [0-9a-f]{8}, data as of \d{4}-\d{2}-\d{2}/);
	await expect(footnote.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
});

test('gap-filled values carry an asterisk; curated values do not', async ({ page }) => {
	await open(page, '/products/landsat-c2-sr?v=1');
	await page.getByRole('button', { name: 'Processing and encoding' }).click();
	await page.getByRole('button', { name: 'Missions and instruments', exact: true }).click();
	const resolution = page.locator('.fact', { hasText: 'Finest reported instrument resolution' });
	await expect(resolution).toContainText('15 m');
	await expect(resolution.locator('.mim-mark')).toHaveCount(1);
	const swath = page.locator('section[aria-labelledby="technical-heading"] .fact', { hasText: 'Swath width' });
	await expect(swath).toContainText('185 km (mission-level)');
	await expect(swath.locator('.mim-mark')).toHaveCount(0);
});

test('StriX shows its active MIM constellation alongside the completed demonstrators', async ({ page }) => {
	await open(page, '/products/synspective-strix-nrb?v=1');
	const panel = page.locator('section[aria-labelledby="mim-heading"]');
	await expect(panel.getByRole('heading', { name: /StriX Constellation/ })).toBeVisible();
	await expect(panel.getByText(/of \d+ planned/)).toBeVisible();
});

test('comparison adds MIM mission rows with asterisks and a footnote', async ({ page }) => {
	await open(page, '/shortlist?v=1&sl=landsat-c2-sr,catalyst-sentinel1-rtc&cmp=landsat-c2-sr,catalyst-sentinel1-rtc&fields=instrument,technical');
	const table = page.getByRole('table', { name: /Side-by-side comparison/ });
	const status = table.getByRole('row', { name: /^Mission status/ });
	await expect(status).toContainText('Landsat 8');
	await expect(status.locator('.mim-mark')).toHaveCount(2);
	await expect(page.locator('.mim-footnote')).toBeVisible();
});

test('the purple asterisk has no accessibility violations in either theme', async ({ page }) => {
	for (const theme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: theme });
		await open(page, '/products/alos2-palsar2-25m-scansar-nrb?v=1');
		for (const toggle of await page.locator('section[aria-labelledby="mim-heading"] button.disclosure-toggle[aria-expanded="false"]').all()) await toggle.click();
		const results = await new AxeBuilder({ page }).include('section[aria-labelledby="mim-heading"]').include('.mim-footnote').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
		expect(results.violations.map((v) => `${theme} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
	}
});

test('missions still operating show a planned end of life, ended missions show their end of life', async ({ page }) => {
	await open(page, '/products/alos2-palsar2-25m-scansar-nrb?v=1');
	const alos = page.locator('section[aria-labelledby="mim-heading"] article', { has: page.getByRole('heading', { name: /^ALOS-2/ }) });
	await expect(alos).toContainText('Operational (extended)');
	await expect(alos).toContainText('Planned end of life');
	await open(page, '/products/landsat-c2-sr?v=1');
	const l5 = page.locator('section[aria-labelledby="mim-heading"] article', { has: page.getByRole('heading', { name: /^Landsat 5/ }) });
	await expect(l5.getByText('End of life', { exact: true })).toBeVisible();
});

test('the agency mark flips to the newest mission with real artwork on hover, focus and tap', async ({ page }) => {
	await open(page, '/products/landsat-c2-sr?v=1');
	const flip = page.locator('.detail-head').getByRole('button', { name: /USGS logo\. Show the satellite: Landsat 9, one of 5 missions, from the CEOS MIM database/ });
	await expect(flip).toHaveAttribute('aria-pressed', 'false');
	await flip.click();
	await expect(flip).toHaveAttribute('aria-pressed', 'true');
	const back = flip.locator('.face.back img');
	// Landsat 9 has a credited picture, so the flip shows the picture, not the silhouette.
	await expect(back).toHaveAttribute('src', /772-landsat-9\.[^/]*png/);
	await expect(flip).toHaveAttribute('title', /Picture: NASA/);
	// Same-origin image (the Content Security Policy allows no other).
	expect(await back.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0 && new URL(img.src).origin === location.origin)).toBe(true);
	// Without any credited picture the flip falls back to the silhouette.
	await open(page, '/products/alos2-palsar2-25m-scansar-nrb?v=1');
	await expect(page.locator('.detail-head button.flip .face.back img')).toHaveAttribute('src', /629-alos-2-icon/);
	// Products whose missions have only generic illustrations do not flip.
	await open(page, '/products/enmap-l2a?v=1');
	await expect(page.locator('button.flip')).toHaveCount(0);
});

test('reduced motion swaps the mark without rotating', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await open(page, '/products/landsat-c2-sr?v=1');
	const flip = page.locator('.detail-head button.flip');
	await flip.click();
	expect(await flip.locator('.inner').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
	await expect(flip.locator('.face.back')).toBeVisible();
	await expect(flip.locator('.face.front')).toBeHidden();
});

test('mission cards show credited pictures with their credit, and silhouettes otherwise', async ({ page }) => {
	await open(page, '/products/landsat-c2-sr?v=1');
	const l9 = page.locator('section[aria-labelledby="mim-heading"] article', { has: page.getByRole('heading', { name: /^Landsat 9/ }) });
	await expect(l9.getByRole('img', { name: 'Landsat 9 spacecraft' })).toBeVisible();
	await expect(l9.locator('figcaption')).toContainText('NASA');
	await open(page, '/products/alos2-palsar2-25m-scansar-nrb?v=1');
	const alos = page.locator('section[aria-labelledby="mim-heading"] article', { has: page.getByRole('heading', { name: /^ALOS-2/ }) });
	await expect(alos.getByRole('img', { name: 'ALOS-2 spacecraft silhouette' })).toBeVisible();
	await expect(alos.locator('figcaption')).toHaveText('Silhouette: CEOS MIM Database (CC BY 4.0)');
});

test.describe('on a touch screen', () => {
	const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13'];
	test.use(iphone);
	test('a second tap flips the mark back (hover cannot leave it stuck)', async ({ page }) => {
		await open(page, '/products/landsat-c2-sr?v=1');
		const flip = page.locator('.detail-head button.flip');
		const angle = () => flip.locator('.inner').evaluate((el) => getComputedStyle(el).transform);
		await flip.tap();
		await expect(flip).toHaveAttribute('aria-pressed', 'true');
		await flip.tap();
		await expect(flip).toHaveAttribute('aria-pressed', 'false');
		await page.locator('h1').tap();
		await expect.poll(angle).toBe('none');
	});
});
