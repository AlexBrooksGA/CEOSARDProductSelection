import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { open } from './helpers';

// CEOS MIM database values come from the committed snapshot, so these run with MIM turned off.

test('product page shows a MIM missions and instruments panel with purple asterisks and a source footnote', async ({ page }) => {
	await open(page, '/products/landsat-c2-sr?v=1');
	const panel = page.locator('section[aria-labelledby="mim-heading"]');
	await expect(panel.getByRole('heading', { level: 2, name: /Missions and instruments/ })).toBeVisible();
	await expect(panel.getByRole('heading', { name: /^Landsat 8/ })).toBeVisible();
	await expect(panel.getByText('2013-02-11')).toBeVisible();
	const mark = panel.locator('.mim-mark').first();
	await expect(mark).toHaveAttribute('title', /CEOS MIM database/);
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
