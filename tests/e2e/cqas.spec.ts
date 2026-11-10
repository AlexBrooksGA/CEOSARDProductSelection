import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { open } from './helpers';

const LANDSAT = '/products/landsat-c2-sr?v=1';
const section = (page: import('@playwright/test').Page) => page.locator('section#cqas');

test('the Landsat product page shows the C-QAS section, labelled as example data, Simple by default', async ({ page }) => {
	await open(page, LANDSAT);
	const cqas = section(page);
	await expect(cqas.getByRole('heading', { level: 2, name: 'C-QAS quality checks' })).toBeVisible();
	await expect(cqas.getByRole('note').getByText('Example data', { exact: true })).toBeVisible();
	await expect(cqas.getByText(/C-QAS has not run on any real scene yet/)).toBeVisible();
	await expect(cqas.getByText(/These checks use the Surface Reflectance PFS v5\.0\.2\. This product's CEOS-ARD assessment used v5\.0/)).toBeVisible();
	await expect(cqas.getByText(/Results for 9 of the 36 Surface Reflectance PFS v5\.0\.2 requirements/)).toBeVisible();
	await expect(cqas.getByText('For the data provider')).toBeVisible();
	await expect(cqas.getByText(/Over 17 scenes at 3 sites/)).toBeVisible();
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
	const badge = page.getByRole('link', { name: /C-QAS example checks/ });
	await expect(badge).toBeVisible();
	await badge.click();
	await expect(section(page)).toBeFocused();
	await expect(page).toHaveURL(/\?v=1#cqas$/);
	await expect(section(page)).toBeInViewport();
	await expect(page.getByRole('link', { name: /See C-QAS quality checks/ })).toBeVisible();

	await section(page).getByRole('radio', { name: 'Advanced' }).check();
	await expect(page).toHaveURL(/[?&]cqas=advanced/);
	await expect(section(page).getByRole('heading', { name: 'PFS findings — checked requirements' })).toBeVisible();
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
	await expect(cqas.getByText(/6 of 9 checked requirements shown \(36 in the PFS\)/)).toBeVisible();
	await cqas.getByRole('radiogroup', { name: 'Show rows with' }).getByRole('radio', { name: 'Not required' }).check();
	await expect(rows).toHaveCount(1);

	await expect(cqas.getByRole('group', { name: /in m; PFS Threshold limit 15 m/ })).toBeVisible();
	await cqas.getByRole('radio', { name: 'pixel' }).check();
	await expect(cqas.getByRole('group', { name: /in pixel; PFS Threshold limit 0\.5 pixel/ })).toBeVisible();
	await cqas.getByRole('radio', { name: 'k = 2' }).check();
	await expect(cqas.getByRole('group', { name: /whiskers, k = 2/ })).toBeVisible();

	const geoChart = cqas.locator('.cq-chart:has(svg[aria-label^="Radial error"])');
	const slider = geoChart.getByRole('slider');
	await slider.focus();
	await page.keyboard.press('ArrowRight');
	await expect(geoChart.locator('.cq-tip')).toContainText('Comparison 2');
	await page.keyboard.press('End');
	await expect(slider).toHaveAttribute('aria-valuenow', '6');
	// The tooltip at the last point stays inside the chart.
	const [tipBox, chartBox] = await Promise.all([geoChart.locator('.cq-tip').boundingBox(), geoChart.boundingBox()]);
	expect(tipBox!.x + tipBox!.width).toBeLessThanOrEqual(chartBox!.x + chartBox!.width + 1);
	// The run code sits in the provenance section, closed by default.
	await expect(cqas.getByRole('button', { name: /^C031: Software/ })).toBeHidden();
	await cqas.getByText('Provenance: run code C031-S502-G1-R1-D01').click();
	await expect(cqas.getByRole('button', { name: /^C031: Software/ })).toBeVisible();
});

test('Advanced view: the series can be limited to one site', async ({ page }) => {
	await open(page, `${LANDSAT}&cqas=advanced`);
	const cqas = section(page);
	await expect(cqas.getByRole('heading', { name: 'Across scenes' })).toBeVisible();
	const scenes = cqas.locator('.cq-stats .fact', { hasText: 'Scenes' }).locator('dd');
	await expect(scenes).toHaveText('17');
	await cqas.getByRole('radiogroup', { name: 'Site' }).getByRole('radio', { name: 'GONA' }).check();
	await expect(scenes).not.toHaveText('17');
	await expect(cqas.getByRole('group', { name: /Red \(B4\) surface reflectance difference for \d+ scenes/ })).toBeVisible();
});

test('every product type shows its own plausible example values', async ({ page }) => {
	await open(page, '/products/ga-sentinel1-nrb?v=1');
	await expect(section(page).getByText(/RCS difference, co-polarised \(VV\)/)).toBeVisible();
	await expect(section(page).getByText(/location error/).first()).toBeVisible();
	await open(page, '/products/landsat-c2-st?v=1');
	await expect(section(page).getByText(/ST difference, surface temperature from Band 10/)).toBeVisible();
	await expect(section(page).locator('.cq-big', { hasText: ' K' }).first()).toBeVisible();
	await open(page, '/products/alos2-palsar2-global-mosaics-rtc?v=1');
	await expect(section(page).getByText('No test defined yet')).toBeVisible();
	await expect(section(page).getByText(/A mosaic combines many acquisitions/)).toBeVisible();
});

test('a square in the strip names its requirement; the link to Advanced keeps focus in the section', async ({ page }) => {
	await open(page, LANDSAT);
	const square = section(page).getByRole('button', { name: /^Data Access: Threshold Not met/ });
	await square.focus();
	await page.keyboard.press('Enter');
	await expect(square).toHaveAttribute('aria-pressed', 'true');
	await expect(section(page).locator('.cq-strip-detail')).toContainText('Data Access · Threshold: Not met');
	await section(page).getByRole('button', { name: /Show findings, plots and evidence/ }).click();
	await expect(section(page).getByRole('radio', { name: 'Advanced' })).toBeChecked();
	await expect(section(page)).toBeFocused();
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
	// Chart text stays inside its chart, including products with many channels.
	for (const id of ['landsat-c2-sr', 'enmap-l2a', 'ga-sentinel1-nrb']) {
		await open(page, `/products/${id}?v=1&cqas=advanced`);
		const clipped = await page.evaluate(() =>
			[...document.querySelectorAll('#cqas .cq-chart > svg')].flatMap((svg) => {
				const box = svg.getBoundingClientRect();
				return [...svg.querySelectorAll('text')]
					.map((text) => ({ text: text.textContent, r: text.getBoundingClientRect() }))
					.filter(({ r }) => r.width > 0 && (r.left < box.left - 2 || r.right > box.right + 2))
					.map(({ text }) => text);
			})
		);
		expect(clipped, id).toEqual([]);
	}
});

test('comparison shows a C-QAS row for both products, one line per test, and links to the section', async ({ page }) => {
	await open(page, '/shortlist?v=1&sl=landsat-c2-sr,sentinel2-level2a&cmp=landsat-c2-sr,sentinel2-level2a');
	const table = page.getByRole('table', { name: /Side-by-side comparison of 2 products/ });
	const row = table.getByRole('row', { name: /C-QAS checks/ });
	await expect(row).toContainText('PFS: 6 Met / 2 Not met (9 of 36 requirements checked)');
	await expect(row).toContainText('Geometric: 12.6 m relative geometric error (0.42 pixel)');
	await expect(row).toContainText('Example data · PFS SR v5.0.2 · report DEMO-L8-001');
	await expect(row).toContainText('report DEMO-S2-L2A-001');
	await expect(row).toContainText('different scenes and sites');
	await row.getByRole('link', { name: 'See C-QAS quality checks for Landsat Collection 2 Surface Reflectance' }).click();
	// The shortlist and comparison survive in the link.
	await expect(page).toHaveURL(/\/products\/landsat-c2-sr\?v=1&sl=landsat-c2-sr%2Csentinel2-level2a&cmp=landsat-c2-sr%2Csentinel2-level2a#cqas$/);
	await expect(page.locator('section#cqas')).toBeInViewport();
});
