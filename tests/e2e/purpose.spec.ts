import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { open } from './helpers';

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

/** The sentence reveals one part at a time; skip optional parts until a question is shown. */
async function skipUntil(page: Page, label: string) {
	for (let i = 0; i < 6 && !(await choice(page, label).isVisible()); i++) {
		await page.getByRole('button', { name: 'Skip this question' }).click();
	}
	await expect(choice(page, label)).toBeVisible();
}

async function describeWetlandPurpose(page: Page, area = '') {
	await choose(page, 'What do you want to do?', 'monitor change');
	await choose(page, 'Where, or in what setting?', 'wetlands');
	await choose(page, 'What do you want to understand?', 'seasonal changes in inundation');
	if (area) {
		await choose(page, 'Region (optional)', 'a specific place');
		await page.getByLabel('Place (optional)').fill(area);
	}
	await skipUntil(page, 'Measurement');
	await choose(page, 'Measurement', 'radar');
	await choose(page, 'Spatial detail', 'small features');
	await choose(page, 'How often', 'across each season');
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
	await expect(page.getByText('Starts with radar products, no numeric limits, and 9 checks to make on each product.')).toBeVisible();
	await expect(page.getByRole('region', { name: 'Your starting setup' })).toHaveCount(0);
	const preview = await reviewSetup(page);
	await expect(preview.getByText(/Illustrative guidance v1 — not reviewed/)).toBeVisible();
	await expect(preview.getByRole('row', { name: /Measurement family Combined CEOS-ARD for Synthetic Aperture Radar/ })).toBeVisible();
	// Qualitative answers never become numeric limits.
	await expect(preview.getByRole('row', { name: /Spatial resolution Not set/ })).toBeVisible();
	await expect(preview.getByRole('row', { name: /Nominal revisit Not set/ })).toBeVisible();
	await expect(preview.getByText('Whether water under vegetation must be detected')).toBeVisible();
	await expect(preview.getByRole('link', { name: /Ramsar Technical Report 10 \(2018\)/ })).toHaveAttribute('target', '_blank');
	// Pressing Enter in a text field does not apply.
	await choose(page, 'Region (optional)', 'a specific place');
	await page.getByLabel('Place (optional)').fill('Test area');
	await page.getByLabel('Place (optional)').press('Enter');
	await expect(journeyHeading(page)).toBeVisible();
	expect(new URL(page.url()).search).not.toContain('fam=');
});

test('Skip to catalogue gives the neutral catalogue and is remembered for the session', async ({ page }) => {
	await open(page);
	await choose(page, 'What do you want to do?', 'map features');
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
	await expect(choice(page, 'What do you want to do?')).toHaveAccessibleName('What do you want to do? map features');
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
	await expect(summary.getByText('I want to monitor change in wetlands, to understand seasonal changes in inundation, in Okavango Delta.')).toBeVisible();
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
	await expect(page.getByText('This changes one of your current filters; review the starting setup to see which.')).toBeVisible();
	await reviewSetup(page);
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
	for (const expected of ['Purpose (your context — not a CEOS suitability assessment)', 'I want to monitor change in wetlands', 'Area (your context; not searched or checked): Okavango Delta', 'guidance version 1, mapping version 1', 'Ramsar', 'Purpose checks (outcomes are your own records, not sourced facts)', 'C-band, open water only']) {
		expect(text).toContain(expected);
	}

	// A different purpose marks earlier rationale and outcomes for review.
	await page.getByRole('link', { name: 'Discover', exact: true }).click();
	await page.getByRole('button', { name: 'Edit purpose' }).click();
	await choose(page, 'What do you want to understand?', 'longer-term change in extent');
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
	await choose(page, 'What do you want to do?', 'do something else');
	await page.getByLabel('Describe your purpose').fill('estimate reservoir storage');
	await choose(page, 'Where, or in what setting?', 'any setting');
	await choose(page, 'What do you want to understand?', 'not sure yet');
	await expect(page.getByText(/Starts with all measurement families, no numeric limits/)).toBeVisible();
	const preview = await reviewSetup(page);
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
	await choose(page, 'What do you want to do?', 'monitor change');
	await skipUntil(page, 'Measurement');
	await choose(page, 'Measurement', 'thermal');
	await expect(page.locator('.backdrop img')).toHaveAttribute('src', /thermal-1920\.webp/);
	// No cursor-driven scene with reduced motion.
	await expect(page.locator('.backdrop canvas.visible')).toHaveCount(0);
	await skipUntil(page, 'Spatial detail');
	await choose(page, 'Spatial detail', 'broad patterns');
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
		await page.emulateMedia({ colorScheme: theme });
		await open(page);
		await page.screenshot({ path: `test-results/screens/journey-empty-${theme}.png` });
		await describeWetlandPurpose(page, 'Okavango Delta');
		await page.getByRole('button', { name: 'Illustrative imagery' }).click();
		await expect(page.getByText(/None of it is satellite data/)).toBeVisible();
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
	// Two contexts, axe and full-page screenshots; the WebGL scene renders in software here.
	test.slow();
	for (const theme of ['light', 'dark'] as const) {
		const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: theme });
		const page = await context.newPage();
		await open(page);
		await expect(page.getByText('What do you want to do?')).toBeVisible();
		await describeWetlandPurpose(page);
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

test('region and period are quick choices with private, readable wording', async ({ page }) => {
	await open(page);
	await choose(page, 'What do you want to do?', 'map features');
	await skipUntil(page, 'Region (optional)');
	await choice(page, 'Region (optional)').click();
	const regions = page.getByRole('listbox', { name: 'Region (optional)' });
	await expect(regions.getByRole('option')).toHaveText([/the whole world/, /Africa/, /Asia/, /Europe/, /North and Central America/, /South America/, /Australia and Oceania/, /Antarctica/, /a specific place/]);
	await regions.getByRole('option', { name: 'Africa' }).click();
	await choice(page, 'Period (optional)').click();
	const year = new Date().getFullYear();
	await expect(page.getByRole('option', { name: new RegExp(`the past decade ${year - 10}–${year}`) })).toBeVisible();
	await page.getByRole('option', { name: /the past decade/ }).click();
	await expect(choice(page, 'Region (optional)')).toHaveAccessibleName('Region (optional) Africa');
	await find(page).click();
	const summary = page.getByRole('region', { name: 'Your purpose' });
	await expect(summary.getByText('I want to map features, across Africa over the past decade.')).toBeVisible();
	expect(page.url()).not.toMatch(/africa|decade|past/i);
});

test('choices work from the keyboard: arrows, type-ahead, Enter and Escape', async ({ page }) => {
	await open(page);
	const goal = choice(page, 'What do you want to do?');
	await goal.focus();
	await page.keyboard.press('Enter');
	const list = page.getByRole('listbox', { name: 'What do you want to do?' });
	await expect(list).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(list).toHaveCount(0);
	await expect(goal).toBeFocused();
	await expect(goal).toHaveAccessibleName('What do you want to do? map features');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('e');
	await page.keyboard.press('Escape');
	await expect(goal).toHaveAccessibleName('What do you want to do? map features');
	await page.keyboard.press('Space');
	await page.keyboard.press('e');
	await page.keyboard.press('Enter');
	await expect(goal).toHaveAccessibleName('What do you want to do? explore my options');
	await expect(goal).toHaveAttribute('aria-expanded', 'false');
});

test('self-described experience sets which details open by default, never the filters', async ({ page }) => {
	await open(page);
	await choose(page, 'Your experience with Earth observation data', 'an Earth observation specialist');
	await choose(page, 'What do you want to do?', 'map features');
	// Specialists see the starting setup and technical limits open.
	await expect(page.getByRole('region', { name: 'Your starting setup' })).toBeVisible();
	await expect(page.getByLabel('Spatial resolution ≤ (m)')).toBeVisible();
	await find(page).click();
	await expect(page.getByRole('button', { name: /^More filters/ })).toHaveAttribute('aria-expanded', 'true');
	expect(page.url()).not.toContain('specialist');

	await page.getByRole('button', { name: 'Edit purpose' }).click();
	await choose(page, 'Your experience with Earth observation data', 'new to Earth observation data');
	await find(page).click();
	await expect(page.getByRole('button', { name: /^More filters/ })).toHaveAttribute('aria-expanded', 'false');
	await expect(page.getByRole('button', { name: 'What the measurement families mean' })).toHaveAttribute('aria-expanded', 'true');
	await expect(page.getByText(/New to Earth observation data\? Open Details/)).toBeVisible();
	// A disclosure the user toggles is remembered over the default.
	await page.getByRole('button', { name: /^More filters/ }).click();
	await page.reload();
	await expect(page.locator('body[data-hydrated="true"]')).toBeAttached();
	await expect(page.getByRole('button', { name: /^More filters/ })).toHaveAttribute('aria-expanded', 'true');
});

test('the sentence appears one part at a time; any part can be skipped and the button is there from the first answer', async ({ page }) => {
	await open(page);
	await expect(choice(page, 'Your experience with Earth observation data')).toBeVisible();
	await expect(choice(page, 'What do you want to do?')).toBeVisible();
	for (const later of ['Where, or in what setting?', 'What do you want to understand?', 'Region (optional)', 'Measurement', 'Spatial detail']) {
		await expect(choice(page, later)).toHaveCount(0);
	}
	await expect(find(page)).toHaveCount(0);
	await choose(page, 'What do you want to do?', 'monitor change');
	await expect(choice(page, 'Where, or in what setting?')).toBeVisible();
	await expect(choice(page, 'What do you want to understand?')).toHaveCount(0);
	await expect(find(page)).toBeVisible();
	await page.getByRole('button', { name: 'Skip this question' }).click();
	await expect(choice(page, 'What do you want to understand?')).toBeVisible();
	await expect(choice(page, 'Where, or in what setting?')).toBeVisible();
	// Answers restored from the session show everything up to them.
	await choose(page, 'What do you want to understand?', 'what has changed and when');
	await page.reload();
	await expect(page.locator('body[data-hydrated="true"]')).toBeAttached();
	await expect(choice(page, 'Region (optional)')).toBeVisible();
	await expect(choice(page, 'Measurement')).toHaveCount(0);
	// Reset hides the later parts again.
	await page.getByRole('button', { name: 'Reset answers' }).click();
	await expect(choice(page, 'Where, or in what setting?')).toHaveCount(0);
});

