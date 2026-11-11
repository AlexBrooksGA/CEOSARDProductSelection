import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { open, useTheme } from './helpers';

const journeyHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Find Earth observation data for your purpose.' });
const find = (page: Page) => page.getByRole('button', { name: 'Find candidate products' });

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The inline choice button whose accessible name starts with its question. */
const choice = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(`^${escape(label)}`) });

async function choose(page: Page, label: string, option: string) {
	await choice(page, label).click();
	await page.getByRole('listbox', { name: label }).getByRole('option', { name: new RegExp(`^${escape(option)}`) }).click();
	await expect(page.getByRole('listbox')).toHaveCount(0);
}

const THEME = 'What is your work about?';
const NEED = 'What do you need to see or measure?';
const USE = 'How will you use the data? (optional)';
const WHERE = 'Where?';
const PERIOD = 'What period do you need?';
const DETAIL = 'What is the smallest thing you need to tell apart?';
const OFTEN = 'How often do you need a usable look?';
const SENTENCE = 'My work is about water and wetlands, needing to see surface water and flooding, to track change through time, across a continent or region since about 2015.';

/** The worked example from the review, with optional private notes. */
async function describeWetlandPurpose(page: Page, notes = '') {
	await choose(page, THEME, 'water and wetlands');
	await choose(page, NEED, 'surface water and flooding');
	await choose(page, USE, 'track change through time');
	await choose(page, WHERE, 'a continent or region');
	await choose(page, PERIOD, 'the years since about 2015');
	await choose(page, DETAIL, 'fields, streets or small water bodies');
	await choose(page, OFTEN, 'each season');
	if (notes) await page.getByLabel('Notes for your shortlist (optional)').fill(notes);
}

async function reviewSetup(page: Page) {
	await page.getByRole('button', { name: 'Review starting setup' }).click();
	const preview = page.getByRole('region', { name: 'Your starting setup' });
	await expect(preview).toBeVisible();
	return preview;
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
	// The starting setup is summarised in one line; the detail stays collapsed until asked for.
	await expect(page.getByText('22 optical and radar products, ordered by 2 preferences, with 11 checks to make on each.')).toBeVisible();
	await expect(page.getByRole('region', { name: 'Your starting setup' })).toHaveCount(0);
	const preview = await reviewSetup(page);
	await expect(preview.getByText(/Illustrative guidance v2 — not reviewed/)).toBeVisible();
	await expect(preview.getByRole('row', { name: /Measurement family Optical and radar .* Filter/ })).toBeVisible();
	// Bands from the answers are Preferred: they order results and never hide a product.
	await expect(preview.getByRole('row', { name: /Reported coverage Continental or multi-country or broader Preferred/ })).toBeVisible();
	await expect(preview.getByRole('row', { name: /Spatial resolution ≤ 30 m Preferred/ })).toBeVisible();
	await expect(preview.getByRole('row', { name: /Nominal revisit Not set Ignore/ })).toBeVisible();
	await expect(preview.getByText('Whether water under vegetation must be detected')).toBeVisible();
	await expect(preview.getByText('The record is stable enough to show real change')).toBeVisible();
	await expect(preview.getByRole('link', { name: /Ramsar Technical Report 10 \(2018\)/ })).toHaveAttribute('target', '_blank');
	await expect(preview.getByRole('link', { name: /Joint WGCV-56 \/ LSI-VC-19 minutes \(2026\)/ })).toBeVisible();
	// Pressing Enter in a text field does not apply.
	await choose(page, PERIOD, 'specific years');
	await page.getByLabel('Years (optional)').fill('2019–2024');
	await page.getByLabel('Years (optional)').press('Enter');
	await expect(journeyHeading(page)).toBeVisible();
	expect(new URL(page.url()).search).not.toContain('fam=');
});

test('the theme menu ties each theme to its CEOS home and shortens what you can ask for', async ({ page }) => {
	await open(page);
	await choice(page, THEME).click();
	const themes = page.getByRole('listbox', { name: THEME });
	await expect(themes.getByRole('option', { name: /agriculture and food security CEOS Work Plan 4\.2 · GEOGLAM/ })).toBeVisible();
	await expect(themes.getByRole('option', { name: /land degradation GEO-LDN/ })).toBeVisible();
	await themes.getByRole('option', { name: /^water and wetlands/ }).click();
	await choice(page, NEED).click();
	await expect(page.getByRole('listbox', { name: NEED }).getByRole('option')).toHaveText([/surface water and flooding/, /vegetation and crop condition/, /land cover/, /surface temperature/, /water colour and quality/, /not sure/]);
	await page.keyboard.press('Escape');
});

test('Skip to catalogue gives the neutral catalogue and is remembered for the session', async ({ page }) => {
	await open(page);
	await choose(page, THEME, 'cities and infrastructure');
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
	await expect(choice(page, THEME)).toHaveAccessibleName(`${THEME} cities and infrastructure`);
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
	await expect(page).toHaveURL(/fam=sr-sar/);
	await expect(page).toHaveURL(/pu=water(~|%7E)water(~|%7E)change/);
	await expect(page).toHaveURL(/gv=2/);
	expect(page.url()).not.toMatch(/Okavango|rev=/);
	const summary = page.getByRole('region', { name: 'Your purpose' });
	await expect(summary.getByText(SENTENCE)).toBeVisible();
	await expect(page.getByLabel('Measurement family')).toHaveValue('Surface Reflectance and Synthetic Aperture Radar');
	await expect(page.locator('article.card')).toHaveCount(22);

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
	await expect(page.getByText('This changes one of your current filters; review the starting setup to see which.')).toBeVisible();
	await reviewSetup(page);
	await expect(page.getByText('Changes from your current filters')).toBeVisible();
	await expect(page.getByText(/Measurement family:.*Surface Reflectance.*→.*Optical and radar/)).toBeVisible();
	await find(page).click();
	await expect(page.getByLabel('Measurement family')).toHaveValue('Surface Reflectance and Synthetic Aperture Radar');
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
	await expect(summary.getByText('My work is about water and wetlands, needing to see surface water and flooding, to track change through time.')).toBeVisible();
	await expect(recipient.getByText(/Okavango|continent/)).toHaveCount(0);
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
	await expect(page.getByText(/^For your purpose:/)).toContainText('water and wetlands');
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
	for (const expected of ['Purpose (your context — not a CEOS suitability assessment)', 'My work is about water and wetlands', 'Your notes: Okavango Delta', 'How the data will be used: track change through time', 'guidance version 2, mapping version 2', 'Ramsar', 'Purpose checks (outcomes are your own records, not sourced facts)', 'C-band, open water only']) {
		expect(text).toContain(expected);
	}

	// A different purpose marks earlier rationale and outcomes for review.
	await page.getByRole('link', { name: 'Discover', exact: true }).click();
	await page.getByRole('button', { name: 'Edit purpose' }).click();
	await choose(page, USE, 'map or classify one point in time');
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
	await choose(page, THEME, 'something else');
	await page.getByLabel('Describe your topic').fill('estimate reservoir storage');
	await choose(page, NEED, 'not sure');
	await expect(page.getByText('26 products from every measurement family, in name order, with 3 checks to make on each.')).toBeVisible();
	const preview = await reviewSetup(page);
	await expect(preview.getByRole('row', { name: /Measurement family All measurement families/ })).toBeVisible();
	await expect(preview.getByText('Whether water under vegetation must be detected')).toHaveCount(0);
	await find(page).click();
	// The custom text is private: the link carries only the fixed ids.
	expect(page.url()).not.toContain('reservoir');
	await expect(page.getByRole('region', { name: 'Your purpose' }).getByText(/estimate reservoir storage/)).toBeVisible();
	await expect(page.locator('article.card')).toHaveCount(26);
});

test('a need with no assessed products shows the gap instead of hiding it', async ({ page }) => {
	await open(page);
	await choose(page, THEME, 'coasts and oceans');
	await choose(page, NEED, 'water colour and quality');
	await expect(page.getByText(/No CEOS-ARD assessed Aquatic Reflectance products are in this catalogue yet/).first()).toBeVisible();
	await expect(page.getByText(/^0 Aquatic Reflectance products/)).toBeVisible();
	await find(page).click();
	await expect(page.getByText('No products match the current settings.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Show all families' })).toBeVisible();
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
	await page.route('**/images/purpose-journey/*', (route) => route.abort());
	await open(page);
	await describeWetlandPurpose(page);
	await expect(page.locator('.backdrop img')).toHaveCount(0);
	await expect(page.locator('.backdrop canvas.visible')).toHaveCount(0);
	await expect(page.locator('.backdrop .gradient')).toBeAttached();
	await page.screenshot({ path: 'test-results/screens/journey-image-failure.png' });
	await find(page).click();
	await expect(page.getByRole('region', { name: 'Your purpose' })).toBeVisible();
	expect(errors).toEqual([]);
});

test('reduced motion shows still imagery that swaps without animation', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await open(page);
	await choose(page, THEME, 'cities and infrastructure');
	await choose(page, NEED, 'surface temperature and heat');
	await expect(page.locator('.backdrop img')).toHaveAttribute('src', /thermal-1920\.webp/);
	// No cursor-driven scene with reduced motion.
	await expect(page.locator('.backdrop canvas.visible')).toHaveCount(0);
	await page.getByRole('button', { name: 'Skip place and time' }).click();
	await choose(page, DETAIL, 'regional patterns');
	await expect(page.locator('.backdrop img')).toHaveAttribute('src', /thermal-coarse\.png/);
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
		test.slow();
		await page.setViewportSize({ width: 1440, height: 900 });
		await useTheme(page, theme);
		await open(page);
		await page.screenshot({ path: `test-results/screens/journey-empty-${theme}.png` });
		await describeWetlandPurpose(page, 'Okavango Delta');
		await page.getByRole('button', { name: 'Illustrative imagery' }).click();
		await expect(page.getByText(/None of it is satellite data/)).toBeVisible();
		await reviewSetup(page);
		expect(await axe(page)).toEqual([]);
		await page.screenshot({ path: `test-results/screens/journey-filled-${theme}.png` });
		await page.screenshot({ path: `test-results/screens/journey-filled-full-${theme}.png`, fullPage: true });
		await find(page).click();
		await expect(page.getByRole('region', { name: 'Your purpose' })).toBeVisible();
		expect(await axe(page)).toEqual([]);
		await page.screenshot({ path: `test-results/screens/journey-results-${theme}.png` });
	});
}

test('narrow screens stack the steps with visible labels and no horizontal scrolling', async ({ browser }) => {
	// Two contexts, axe and full-page screenshots; the WebGL scene renders in software here.
	test.slow();
	for (const theme of ['light', 'dark'] as const) {
		const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
		await useTheme(context, theme);
		const page = await context.newPage();
		await open(page);
		await expect(page.getByText(THEME)).toBeVisible();
		await describeWetlandPurpose(page);
		await expect(page.getByText(DETAIL)).toBeVisible();
		await expect(find(page)).toBeVisible();
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

test('scale and period are quick choices with private, readable wording', async ({ page }) => {
	await open(page);
	await choose(page, THEME, 'cities and infrastructure');
	await choose(page, NEED, 'ground movement and structure');
	await choice(page, WHERE).click();
	const scales = page.getByRole('listbox', { name: WHERE });
	await expect(scales.getByRole('option')).toHaveText([/global or many regions/, /a continent or region/, /one country/, /a specific site/]);
	await scales.getByRole('option', { name: /^one country/ }).click();
	await choice(page, PERIOD).click();
	const year = new Date().getFullYear();
	await expect(page.getByRole('option', { name: new RegExp(`a long record \\(20 years or more\\) ${year - 20}–${year}`) })).toBeVisible();
	await page.getByRole('option', { name: /^a long record/ }).click();
	await expect(choice(page, WHERE)).toHaveAccessibleName(`${WHERE} one country`);
	await find(page).click();
	const summary = page.getByRole('region', { name: 'Your purpose' });
	await expect(summary.getByText('My work is about cities and infrastructure, needing to see ground movement and structure, within one country over a long record (20 years or more).')).toBeVisible();
	// Scale orders by coverage; the period is never in the link.
	await expect(page).toHaveURL(/cov=/);
	expect(page.url()).not.toMatch(/country|record|long/i);
});

test('choices work from the keyboard: arrows, type-ahead, Enter and Escape', async ({ page }) => {
	await open(page);
	const theme = choice(page, THEME);
	await theme.focus();
	await page.keyboard.press('Enter');
	const list = page.getByRole('listbox', { name: THEME });
	await expect(list).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(list).toHaveCount(0);
	await expect(theme).toBeFocused();
	await expect(theme).toHaveAccessibleName(`${THEME} forests, carbon and land use`);
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('w');
	await page.keyboard.press('Escape');
	await expect(theme).toHaveAccessibleName(`${THEME} forests, carbon and land use`);
	await page.keyboard.press('Space');
	await page.keyboard.press('w');
	await page.keyboard.press('Enter');
	await expect(theme).toHaveAccessibleName(`${THEME} water and wetlands`);
	await expect(theme).toHaveAttribute('aria-expanded', 'false');
});

test('"Show technical detail" sets which details open by default, never the filters', async ({ page }) => {
	await open(page);
	await page.getByLabel('Show technical detail').check();
	await choose(page, THEME, 'agriculture and food security');
	await choose(page, NEED, 'vegetation and crop condition');
	// With technical detail, the starting setup and technical limits are open.
	await expect(page.getByRole('region', { name: 'Your starting setup' })).toBeVisible();
	await expect(page.getByLabel('Spatial resolution ≤ (m)')).toBeVisible();
	await find(page).click();
	await expect(page.getByRole('button', { name: /^More filters/ })).toHaveAttribute('aria-expanded', 'true');
	expect(page.url()).not.toContain('specialist');

	await page.getByRole('button', { name: 'Edit purpose' }).click();
	await page.getByLabel('Show technical detail').uncheck();
	await find(page).click();
	await expect(page.getByRole('button', { name: /^More filters/ })).toHaveAttribute('aria-expanded', 'false');
	// A disclosure the user toggles is remembered over the default.
	await page.getByRole('button', { name: /^More filters/ }).click();
	await page.reload();
	await expect(page.locator('body[data-hydrated="true"]')).toBeAttached();
	await expect(page.getByRole('button', { name: /^More filters/ })).toHaveAttribute('aria-expanded', 'true');
});

test('the steps appear in turn; place and time can be skipped and the button appears once a need is chosen', async ({ page }) => {
	await open(page);
	await expect(choice(page, THEME)).toBeVisible();
	for (const later of [NEED, WHERE, DETAIL]) await expect(choice(page, later)).toHaveCount(0);
	await expect(find(page)).toHaveCount(0);
	await choose(page, THEME, 'forests, carbon and land use');
	await expect(choice(page, NEED)).toBeVisible();
	await expect(choice(page, WHERE)).toHaveCount(0);
	await expect(find(page)).toHaveCount(0);
	await choose(page, NEED, 'burnt area');
	await expect(choice(page, WHERE)).toBeVisible();
	await expect(choice(page, DETAIL)).toHaveCount(0);
	await expect(find(page)).toBeVisible();
	await page.getByRole('button', { name: 'Skip place and time' }).click();
	await expect(choice(page, DETAIL)).toBeVisible();
	// Answers restored from the session show everything up to them.
	await page.reload();
	await expect(page.locator('body[data-hydrated="true"]')).toBeAttached();
	await expect(choice(page, WHERE)).toBeVisible();
	await expect(choice(page, DETAIL)).toHaveCount(0);
	// Changing the theme drops a need it does not offer.
	await choose(page, THEME, 'water and wetlands');
	await expect(choice(page, NEED)).toHaveAccessibleName(/choose what you need$/);
	// Reset hides the later steps again.
	await page.getByRole('button', { name: 'Reset answers' }).click();
	await expect(choice(page, NEED)).toHaveCount(0);
});
