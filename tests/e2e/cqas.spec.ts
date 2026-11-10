import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { open } from './helpers';

const LANDSAT = '/products/landsat-c2-sr?v=1';
const section = (page: import('@playwright/test').Page) => page.locator('section#cqas');

test('the Landsat product page shows the C-QAS section, labelled as example data, Simple by default', async ({ page }) => {
	await open(page, LANDSAT);
	const cqas = section(page);
	await expect(cqas.getByRole('heading', { level: 2, name: 'C-QAS quality checks' })).toBeVisible();
	await expect(cqas.getByText('Concept — example data')).toBeVisible();
	await expect(cqas.getByText(/No scene has been assessed/)).toBeVisible();
	await expect(cqas.getByText(/C-QAS checks use SR PFS v5\.0\.2; this product's CEOS-ARD assessment used v5\.0\./)).toBeVisible();
	await expect(cqas.getByRole('radio', { name: 'Simple' })).toBeChecked();
	await expect(cqas.getByText('12.6 m')).toBeVisible();
	await expect(cqas.locator('.cq-strip button')).toHaveCount(9);
	await expect(cqas.getByText(/not a CEOS-ARD assessment/)).toBeVisible();
	// It sits after the three concept panels and before access links.
	const order = await page.locator('main h2').allInnerTexts();
	expect(order.indexOf('C-QAS quality checks')).toBeGreaterThan(order.indexOf('My requirements and open checks'));
	expect(order.indexOf('C-QAS quality checks')).toBeLessThan(order.indexOf('Access, documentation and samples'));
});

test('header badge and quality-evidence link jump to the section; Advanced is linkable', async ({ page }) => {
	await open(page, LANDSAT);
	const badge = page.getByRole('link', { name: /C-QAS example: 6 Met \/ 2 Not met/ });
	await expect(badge).toBeVisible();
	await badge.click();
	await expect(section(page)).toBeFocused();
	await expect(page).toHaveURL(/#cqas$/);
	await expect(page.getByRole('link', { name: /See C-QAS quality checks/ })).toBeVisible();

	await section(page).getByRole('radio', { name: 'Advanced' }).check();
	await expect(page).toHaveURL(/[?&]cqas=advanced/);
	await expect(section(page).getByRole('heading', { name: 'PFS findings — selected requirements' })).toBeVisible();
	await page.reload();
	await expect(section(page).getByRole('radio', { name: 'Advanced' })).toBeChecked();
});

test('Advanced view: filter findings, switch units and coverage factor, run code legend', async ({ page }) => {
	await open(page, `${LANDSAT}&cqas=advanced`);
	const cqas = section(page);
	const rows = cqas.locator('table.cq-findings tbody tr');
	await expect(rows).toHaveCount(9);
	await cqas.getByRole('radiogroup', { name: 'Show rows with' }).getByRole('radio', { name: 'Not met' }).check();
	await expect(rows).toHaveCount(6);
	await expect(cqas.getByText(/6 of 36 requirements shown \(filtered from 9 selected\)/)).toBeVisible();
	await cqas.getByRole('radiogroup', { name: 'Show rows with' }).getByRole('radio', { name: 'Not required' }).check();
	await expect(rows).toHaveCount(1);

	await cqas.getByRole('radio', { name: 'metres' }).check();
	await expect(cqas.getByRole('group', { name: /in m; PFS Threshold limit 15 m/ })).toBeVisible();
	await cqas.getByRole('radio', { name: 'k = 2' }).check();
	await expect(cqas.getByRole('group', { name: /whiskers, k = 2/ })).toBeVisible();

	const slider = cqas.getByRole('slider');
	await slider.focus();
	await page.keyboard.press('ArrowRight');
	await expect(cqas.locator('.cq-tip')).toContainText('Comparison 2');
	await expect(cqas.getByRole('button', { name: /^C031: Software/ })).toBeVisible();
	await expect(cqas.getByText('Run C031-S502-G1-R1-D01', { exact: false })).toBeVisible();
});

test('products without a C-QAS report show no C-QAS section or badge', async ({ page }) => {
	await open(page, '/products/sentinel2-level2a?v=1');
	await expect(page.getByRole('heading', { level: 1, name: 'Sentinel-2 Level-2A' })).toBeVisible();
	await expect(section(page)).toHaveCount(0);
	await expect(page.getByText(/C-QAS/)).toHaveCount(0);
});

test('an unrecognised cqas value is ignored with a message', async ({ page }) => {
	await open(page, `${LANDSAT}&cqas=expert`);
	await expect(section(page).getByRole('radio', { name: 'Simple' })).toBeChecked();
});

for (const theme of ['light', 'dark'] as const) {
	for (const mode of ['simple', 'advanced'] as const) {
		test(`C-QAS ${mode} view has no detectable accessibility violations (${theme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme: theme });
			await open(page, `${LANDSAT}&cqas=${mode}`);
			const results = await new AxeBuilder({ page }).include('#cqas').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
			expect(results.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
		});
	}
}

test('the C-QAS section fits a 390 px phone without horizontal page scroll', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await open(page, `${LANDSAT}&cqas=advanced`);
	await expect(section(page)).toBeVisible();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	expect(overflow).toBeLessThanOrEqual(0);
});

test('comparison shows a C-QAS row with "No C-QAS check" for the other product and links to the section', async ({ page }) => {
	await open(page, '/shortlist?v=1&sl=landsat-c2-sr,sentinel2-level2a&cmp=landsat-c2-sr,sentinel2-level2a');
	const table = page.getByRole('table', { name: /Side-by-side comparison of 2 products/ });
	const row = table.getByRole('row', { name: /C-QAS scene check/ });
	await expect(row).toContainText('6 Met / 2 Not met selected Threshold rows (9 of 36)');
	await expect(row).toContainText('Concept — example data');
	await expect(row).toContainText('No C-QAS check');
	await row.getByRole('link', { name: 'See C-QAS quality checks' }).click();
	await expect(page).toHaveURL(/\/products\/landsat-c2-sr\?.*#cqas$/);
	await expect(page.locator('section#cqas')).toBeInViewport();
});
