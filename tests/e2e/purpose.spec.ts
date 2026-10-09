import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { open } from './helpers';

const journeyHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Find Earth observation data for your purpose.' });
const find = (page: Page) => page.getByRole('button', { name: 'Find candidate products' });

async function describeWetlandPurpose(page: Page, area = '') {
	await page.getByLabel('What do you want to do?').selectOption('monitor-change');
	await page.getByLabel('Where, or in what setting?').selectOption('wetlands');
	await page.getByLabel('What do you want to understand?').selectOption('seasonal-inundation');
	if (area) await page.getByLabel('Area (optional)').fill(area);
	await page.getByLabel('Measurement').selectOption('sar');
	await page.getByLabel('Spatial detail').selectOption('small');
	await page.getByLabel('How often').selectOption('seasonal');
}

async function axe(page: Page) {
	const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
	return results.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test('a fresh visit shows the purpose entry; the preview is live but changes nothing until applied', async ({ page }) => {
	await open(page);
	await expect(journeyHeading(page)).toBeVisible();
	await expect(page.getByText('Illustrative imagery')).toBeVisible();
	await expect(find(page)).toHaveCount(0);
	await describeWetlandPurpose(page);
	const preview = page.getByRole('region', { name: 'Your starting setup' });
	await expect(preview).toBeVisible();
	await expect(preview.getByText(/Illustrative guidance v1 — not reviewed/)).toBeVisible();
	await expect(preview.getByRole('row', { name: /Measurement family Combined CEOS-ARD for Synthetic Aperture Radar/ })).toBeVisible();
	// Qualitative answers never become numeric limits.
	await expect(preview.getByRole('row', { name: /Spatial resolution Not set/ })).toBeVisible();
	await expect(preview.getByRole('row', { name: /Nominal revisit Not set/ })).toBeVisible();
	await expect(preview.getByText('Whether water under vegetation must be detected')).toBeVisible();
	await expect(preview.getByRole('link', { name: /Ramsar Technical Report 10 \(2018\)/ })).toHaveAttribute('target', '_blank');
	// Pressing Enter in a text field does not apply.
	await page.getByLabel('Area (optional)').fill('Test area');
	await page.getByLabel('Area (optional)').press('Enter');
	await expect(journeyHeading(page)).toBeVisible();
	expect(new URL(page.url()).search).not.toContain('fam=');
});

test('Skip to catalogue gives the neutral catalogue and is remembered for the session', async ({ page }) => {
	await open(page);
	await page.getByLabel('What do you want to do?').selectOption('map-features');
	await page.getByRole('button', { name: 'Skip to catalogue' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Find CEOS-ARD data products' })).toBeVisible();
	await expect(page.getByLabel('Measurement family')).toHaveValue('All product families');
	await expect(page.locator('article.card')).toHaveCount(26);
	await expect(page.getByRole('region', { name: 'Start with your purpose' })).toBeVisible();
	await page.reload();
	await expect(page.locator('body[data-hydrated="true"]')).toBeAttached();
	await expect(journeyHeading(page)).toHaveCount(0);
	// The skipped draft is kept for later.
	await page.getByRole('region', { name: 'Start with your purpose' }).getByRole('button', { name: 'Start with your purpose' }).click();
	await expect(page.getByLabel('What do you want to do?')).toHaveValue('map-features');
});

test('meaningful links bypass the entry; a bare version-only link does not', async ({ page }) => {
	await open(page, '/?v=1&fam=sr');
	await expect(journeyHeading(page)).toHaveCount(0);
	await expect(page.getByLabel('Measurement family')).toHaveValue('Surface Reflectance');
	const fresh = await page.context().browser()!.newPage();
	await open(fresh, '/?v=1');
	await expect(journeyHeading(fresh)).toBeVisible();
	await fresh.close();
	// Deep links to other pages never show the entry.
	await open(page, '/products/landsat-c2-sr?v=1');
	await expect(page.getByRole('heading', { level: 1, name: 'Landsat Collection 2 Surface Reflectance' })).toBeVisible();
});

test('applies exactly once, lands on the purpose summary, keeps private text out of the URL, and undoes', async ({ page }) => {
	await open(page);
	await describeWetlandPurpose(page, 'Okavango Delta');
	await find(page).click();
	await expect(page.getByRole('heading', { name: 'Your purpose' })).toBeFocused();
	await expect(page).toHaveURL(/fam=sar/);
	await expect(page).toHaveURL(/pu=monitor-change(~|%7E)wetlands(~|%7E)seasonal-inundation/);
	await expect(page).toHaveURL(/gv=1/);
	expect(page.url()).not.toMatch(/Okavango|res=|rev=/);
	const summary = page.getByRole('region', { name: 'Your purpose' });
	await expect(summary.getByText('I want to monitor change in wetlands, to understand seasonal changes in inundation.')).toBeVisible();
	await expect(summary.getByText(/Okavango Delta/)).toBeVisible();
	await expect(page.getByLabel('Measurement family')).toHaveValue('Synthetic Aperture Radar');

	// Manual edits are respected and flagged; the purpose never re-applies itself.
	await page.getByLabel('Measurement family').selectOption('Surface Reflectance');
	await expect(summary.getByText('Filters adjusted since setup')).toBeVisible();
	await page.reload();
	await expect(page.locator('body[data-hydrated="true"]')).toBeAttached();
	await expect(page.getByLabel('Measurement family')).toHaveValue('Surface Reflectance');
	await expect(page.getByRole('region', { name: 'Your purpose' }).getByText('Filters adjusted since setup')).toBeVisible();

	// Edit shows the difference against the current filters, then re-applies once.
	await page.getByRole('button', { name: 'Edit purpose' }).click();
	await expect(page.getByRole('button', { name: 'Back to results' })).toBeVisible();
	await expect(page.getByText('Changes from your current filters')).toBeVisible();
	await expect(page.getByText(/Measurement family:.*Surface Reflectance.*→.*Synthetic Aperture Radar/)).toBeVisible();
	await find(page).click();
	await expect(page.getByLabel('Measurement family')).toHaveValue('Synthetic Aperture Radar');
	await page.getByRole('region', { name: 'Your purpose' }).getByRole('button', { name: /Undo: Applied your purpose/ }).click();
	await expect(page.getByLabel('Measurement family')).toHaveValue('Surface Reflectance');

	// Clear purpose keeps filters; undo brings the purpose back.
	await page.getByRole('button', { name: 'Clear purpose' }).click();
	await expect(page).not.toHaveURL(/pu=/);
	await expect(page.getByLabel('Measurement family')).toHaveValue('Surface Reflectance');
	await page.getByRole('region', { name: 'Start with your purpose' }).getByRole('button', { name: /Undo: Cleared your purpose/ }).click();
	await expect(page).toHaveURL(/pu=/);
	await expect(page.getByRole('region', { name: 'Your purpose' })).toBeVisible();
});

test('a shared purpose link carries only the public purpose; private details stay behind', async ({ page, browser }) => {
	await open(page);
	await describeWetlandPurpose(page, 'Okavango Delta');
	await find(page).click();
	await expect(page).toHaveURL(/pu=/);
	const shared = page.url();
	const other = await browser.newContext();
	const recipient = await other.newPage();
	await open(recipient, shared);
	await expect(journeyHeading(recipient)).toHaveCount(0);
	const summary = recipient.getByRole('region', { name: 'Your purpose' });
	await expect(summary.getByText(/Purpose from a shared link/)).toBeVisible();
	await expect(summary.getByText('I want to monitor change in wetlands, to understand seasonal changes in inundation.')).toBeVisible();
	await expect(recipient.getByText(/Okavango/)).toHaveCount(0);
	await other.close();
});

test('purpose checks follow into details, comparison and the copied summary; changing purpose flags rationale', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await open(page);
	await describeWetlandPurpose(page, 'Okavango Delta');
	await find(page).click();
	await page.getByRole('button', { name: 'Add to shortlist ALOS-2 PALSAR-2 25m ScanSAR NRB' }).click();
	await page.getByRole('button', { name: 'Add to shortlist Catalyst Sentinel-1 RTC' }).click();

	await page.locator('article.card', { has: page.getByRole('heading', { name: 'Catalyst Sentinel-1 RTC', exact: true }) }).getByRole('link', { name: /^Details/ }).click();
	await expect(page.getByRole('heading', { name: 'Checks for your purpose' })).toBeVisible();
	await expect(page.getByText(/^For your purpose:/)).toContainText('monitor change in wetlands');
	await page.getByRole('combobox', { name: 'Your record for Whether water under vegetation must be detected' }).selectOption('supports');
	await page.getByLabel('Note for Whether water under vegetation must be detected').fill('C-band, open water only');
	await page.getByLabel('Note for Whether water under vegetation must be detected').press('Tab');

	await page.getByRole('link', { name: /Shortlist & compare \(2\)/ }).click();
	await page.getByText('Notes for this product').first().click();
	await page.getByLabel('Why retained').first().fill('Radar through wet-season cloud');
	await page.getByRole('button', { name: 'Compare ALOS-2 PALSAR-2 25m ScanSAR NRB' }).click();
	await page.getByRole('button', { name: 'Compare Catalyst Sentinel-1 RTC' }).click();
	const table = page.getByRole('table', { name: /Side-by-side comparison of 2 products/ });
	const headers = await table.getByRole('rowheader').allInnerTexts();
	// Requirements and purpose checks come before descriptive groups.
	const index = (name: string) => headers.findIndex((h) => h.startsWith(name));
	expect(index('Measurement for your purpose')).toBeGreaterThanOrEqual(0);
	expect(index('Whether water under vegetation must be detected')).toBeLessThan(index('Nominal revisit'));
	await expect(table.getByText('Your record: Checked — supports my use')).toBeVisible();
	await expect(table.getByText('Your note: C-band, open water only')).toBeVisible();

	await page.getByRole('button', { name: 'Copy selection summary' }).click();
	const text = await page.evaluate(() => navigator.clipboard.readText());
	for (const expected of ['Purpose (your context — not a CEOS suitability assessment)', 'I want to monitor change in wetlands', 'Area (your description; not searched or checked): Okavango Delta', 'guidance version 1, mapping version 1', 'Ramsar', 'Purpose checks (outcomes are your own records, not sourced facts)', 'C-band, open water only']) {
		expect(text).toContain(expected);
	}

	// A different purpose marks earlier rationale and outcomes for review.
	await page.getByRole('link', { name: 'Discover', exact: true }).click();
	await page.getByRole('button', { name: 'Edit purpose' }).click();
	await page.getByLabel('What do you want to understand?').selectOption('extent-change');
	await find(page).click();
	await page.getByRole('link', { name: /Shortlist & compare \(2\)/ }).click();
	await expect(page.getByText('Review rationale: criteria changed since this note was written.')).toBeVisible();
	const catalyst = page.locator('li.entry', { has: page.getByRole('heading', { name: 'Catalyst Sentinel-1 RTC' }) });
	await expect(catalyst.getByText('Notes for this product — review needed')).toBeVisible();
	await expect(catalyst.getByText(/check records were made for a different purpose/)).toBeVisible();
	await expect(catalyst.getByText('Recorded for a different purpose — review this outcome.')).toBeVisible();
});

test('custom and not-sure routes give general guidance without inventing filters', async ({ page }) => {
	await open(page);
	await page.getByLabel('What do you want to do?').selectOption('custom');
	await page.getByLabel('Describe your purpose').fill('estimate reservoir storage');
	await page.getByLabel('Where, or in what setting?').selectOption('any');
	await page.getByLabel('What do you want to understand?').selectOption('unsure');
	const preview = page.getByRole('region', { name: 'Your starting setup' });
	await expect(preview).toBeVisible();
	await expect(preview.getByText('estimate reservoir storage')).toBeVisible();
	await expect(preview.getByRole('row', { name: /Measurement family All measurement families/ })).toBeVisible();
	await expect(preview.getByText('Water under vegetation')).toHaveCount(0);
	await find(page).click();
	// The custom text is private: the link carries no purpose key for it.
	expect(page.url()).not.toContain('reservoir');
	await expect(page.getByRole('region', { name: 'Your purpose' }).getByText(/estimate reservoir storage/)).toBeVisible();
	await expect(page.locator('article.card')).toHaveCount(26);
});

test('links with an unknown guidance version or malformed purpose keep their filters and explain why', async ({ page }) => {
	await open(page, '/?v=1&fam=sar&pu=monitor-change~wetlands&gv=99');
	await expect(page.getByText(/refers to purpose guidance version 99, which isn’t available here/)).toBeVisible();
	await expect(page.getByLabel('Measurement family')).toHaveValue('Synthetic Aperture Radar');
	await expect(page.getByRole('heading', { name: 'Checks for your purpose' })).toHaveCount(0);
	await open(page, '/?v=1&fam=sar&pu=BAD!!');
	await expect(page.getByText('The purpose in this link was not recognised and was ignored; the criteria in the link were kept.')).toBeVisible();
	await expect(page.getByLabel('Measurement family')).toHaveValue('Synthetic Aperture Radar');
});

test('imagery failure falls back to the gradient; the journey still works', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.route('**/images/purpose-journey/*.webp', (route) => route.abort());
	await open(page);
	await describeWetlandPurpose(page);
	await expect(page.locator('.backdrop img')).toHaveCount(0);
	await expect(page.locator('.backdrop .gradient')).toBeAttached();
	await page.screenshot({ path: 'test-results/screens/journey-image-failure.png' });
	await find(page).click();
	await expect(page.getByRole('region', { name: 'Your purpose' })).toBeVisible();
	expect(errors).toEqual([]);
});

test('reduced motion swaps imagery without animation', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await open(page);
	await page.getByLabel('What do you want to do?').selectOption('monitor-change');
	await page.getByLabel('Measurement').selectOption('st');
	await expect(page.locator('.backdrop img')).toHaveAttribute('src', /thermal-fine\.webp/);
	const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
	expect(running).toBe(0);
	await expect(page.locator('.backdrop img')).toHaveCount(1);
});

test('works in memory when session storage is unavailable', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(window, 'sessionStorage', {
			get() {
				throw new DOMException('blocked', 'SecurityError');
			}
		});
	});
	await open(page);
	await expect(journeyHeading(page)).toBeVisible();
	await describeWetlandPurpose(page);
	await find(page).click();
	await expect(page.getByRole('region', { name: 'Your purpose' })).toBeVisible();
	await expect(page.getByText(/Browser session storage is unavailable/)).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
	test(`purpose entry and results have no detectable accessibility violations (${theme})`, async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.emulateMedia({ colorScheme: theme });
		await open(page);
		await page.screenshot({ path: `test-results/screens/journey-empty-${theme}.png` });
		await describeWetlandPurpose(page, 'Okavango Delta');
		await page.getByRole('button', { name: 'Illustrative imagery' }).click();
		await expect(page.getByText(/not satellite data/)).toBeVisible();
		expect(await axe(page)).toEqual([]);
		await page.screenshot({ path: `test-results/screens/journey-filled-${theme}.png` });
		await page.screenshot({ path: `test-results/screens/journey-filled-full-${theme}.png`, fullPage: true });
		await find(page).click();
		await expect(page.getByRole('region', { name: 'Your purpose' })).toBeVisible();
		expect(await axe(page)).toEqual([]);
		await page.screenshot({ path: `test-results/screens/journey-results-${theme}.png` });
	});
}

test('narrow screens stack the sentence with visible labels and no horizontal scrolling', async ({ browser }) => {
	for (const theme of ['light', 'dark'] as const) {
		const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: theme });
		const page = await context.newPage();
		await open(page);
		await expect(page.getByText('What do you want to do?')).toBeVisible();
		await describeWetlandPurpose(page);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
		expect(await axe(page)).toEqual([]);
		await page.screenshot({ path: `test-results/screens/journey-390-${theme}.png`, fullPage: true });
		await find(page).click();
		await expect(page.getByRole('region', { name: 'Your purpose' })).toBeInViewport();
		expect(await page.evaluate(() => [document.documentElement.scrollWidth, window.scrollX])).toEqual([390, 0]);
		await page.screenshot({ path: `test-results/screens/journey-390-results-${theme}.png` });
		await context.close();
	}
});
