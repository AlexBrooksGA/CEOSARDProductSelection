import { expect, test } from '@playwright/test';
import { card, open, settle } from './helpers';

test('discovery → detail → shortlist → comparison → provider access', async ({ page }) => {
	await open(page);
	await page.getByLabel('Search product and mission names').fill('landsat collection 2 surface reflectance');
	await settle(page);
	const landsat = card(page, 'Landsat Collection 2 Surface Reflectance');
	await landsat.getByRole('link', { name: /^Details/ }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Landsat Collection 2 Surface Reflectance' })).toBeVisible();
	// Assessment, quality evidence and requirements are separate sections.
	for (const heading of ['CEOS-ARD assessment', 'Measured quality evidence', 'My requirements and open checks']) {
		await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible();
	}
	await expect(page.getByText('Surface Reflectance v5.0').first()).toBeVisible();
	await expect(page.getByText('2021-06-04').first()).toBeVisible();
	await expect(page.getByText('Not found in the sources checked (catalogue checked 2026-07-12)').first()).toBeVisible();
	await page.getByRole('button', { name: 'Add to shortlist' }).click();
	await page.getByRole('link', { name: '← Back to results' }).click();
	await expect(page.getByLabel('Search product and mission names')).toHaveValue('landsat collection 2 surface reflectance');

	await page.getByLabel('Search product and mission names').fill('sentinel-2');
	await settle(page);
	await card(page, 'Sentinel-2 Level-2A').getByRole('button', { name: /Add to shortlist/ }).click();
	await page.getByRole('link', { name: /Shortlist & compare \(2\)/ }).click();
	await page.getByRole('button', { name: 'Compare Landsat Collection 2 Surface Reflectance' }).click();
	await page.getByRole('button', { name: 'Compare Sentinel-2 Level-2A' }).click();
	const table = page.getByRole('table', { name: /Side-by-side comparison of 2 products/ });
	await expect(table).toBeVisible();
	for (const row of ['Nominal revisit', 'Product update frequency', 'Observation record period', 'Local availability', 'PFS and version', 'Approval date', 'Assessment evidence', 'Geometric accuracy / uncertainty', 'Data format', 'Access']) {
		await expect(table.getByRole('rowheader', { name: new RegExp(`^${row}`) })).toBeVisible();
	}
	const access = table.getByRole('link', { name: /Access data.*Landsat/ });
	await expect(access).toHaveAttribute('target', '_blank');
	await expect(access).toHaveAttribute('href', 'https://earthexplorer.usgs.gov/');
	await expect(access).toHaveAttribute('rel', /noopener/);
});

test('retains four shortlist entries, compares three, keeps work across criteria changes, navigation and reload', async ({ page }) => {
	const ids = ['landsat-c2-sr', 'sentinel2-level2a', 'enmap-l2a', 'desis-l2a'];
	await open(page, `/shortlist?v=1&sl=${ids.join(',')}&cmp=landsat-c2-sr,sentinel2-level2a,enmap-l2a`);
	await expect(page.locator('li.entry')).toHaveCount(4);
	await expect(page.getByRole('table', { name: /comparison of 3 products/ })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Compare DESIS L2A' })).toBeDisabled();
	await expect(page.getByText(/Comparison is full \(3\)/)).toBeVisible();

	await page.getByText('Notes for this product').first().click();
	await page.getByLabel('Why retained').first().fill('Longest archive for change detection');
	await page.getByLabel('Investigation notes').fill('Wetland inundation, 2015–2024');

	// Change criteria via a profile in Discover.
	await page.getByRole('link', { name: 'Edit in Discover' }).click();
	await page.getByRole('button', { name: 'Starting points and my profiles' }).click();
	await page.getByRole('button', { name: 'Preview Monitor Change Over Time' }).click();
	await page.getByRole('button', { name: 'Apply profile' }).click();
	await page.getByRole('button', { name: 'Dark theme' }).click();
	await page.getByRole('link', { name: /Shortlist & compare \(4\)/ }).click();
	await expect(page.locator('li.entry')).toHaveCount(4);
	await expect(page.getByText('Review rationale: criteria changed since this note was written.')).toBeVisible();
	await expect(page.getByLabel('Why retained').first()).toHaveValue('Longest archive for change detection');
	await expect(page.getByText('In current results: Reported outside: nominal revisit').first()).toBeVisible();
	await page.getByRole('link', { name: 'Edit in Discover' }).click();
	await page.getByLabel('Measurement family').selectOption('Synthetic Aperture Radar');
	await page.getByRole('link', { name: /Shortlist & compare \(4\)/ }).click();
	await expect(page.getByText(/Outside current results: Measurement family is Surface Reflectance/).first()).toBeVisible();

	await page.reload();
	await expect(page.locator('body[data-hydrated="true"]')).toBeAttached();
	await expect(page.locator('li.entry')).toHaveCount(4);
	await expect(page.getByLabel('Investigation notes')).toHaveValue('Wetland inundation, 2015–2024');
	await expect(page.getByText('Review rationale: criteria changed since this note was written.')).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

	// Removing a comparison column keeps the shortlist entry.
	await page.getByRole('button', { name: /Remove column EnMAP/ }).click();
	await expect(page.getByRole('table', { name: /comparison of 2 products/ })).toBeVisible();
	await expect(page.locator('li.entry')).toHaveCount(4);

	// Bare URL in the same session restores the last state; notes never enter the URL.
	await open(page, '/shortlist');
	await expect(page).toHaveURL(/sl=landsat-c2-sr/);
	expect(page.url()).not.toContain('Wetland');
	await expect(page.locator('li.entry')).toHaveCount(4);
});

test('copy selection summary contains IDs, criteria, rationale, dates and the review flag', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await open(page, '/shortlist?v=1&rev=req:5&sl=landsat-c2-sr,sentinel2-level2a,mim-product:77&cmp=landsat-c2-sr,sentinel2-level2a');
	await page.getByText('Notes for this product').first().click();
	await page.getByLabel('Why retained').first().fill('Archive depth');
	await page.getByLabel('Open checks').first().fill('Cloud in wet season');
	await open(page, '/shortlist?v=1&rev=req:3&sl=landsat-c2-sr,sentinel2-level2a,mim-product:77&cmp=landsat-c2-sr,sentinel2-level2a');
	await page.getByRole('button', { name: 'Copy selection summary' }).click();
	await expect(page.locator('p[role="status"]', { hasText: 'Selection summary copied to the clipboard.' })).toBeVisible();
	const text = await page.evaluate(() => navigator.clipboard.readText());
	for (const expected of ['[landsat-c2-sr]', '[sentinel2-level2a]', 'Nominal revisit ≤ 3 days · Required', 'Why retained: Archive depth', 'Open checks: Cloud in wet season', 'REVIEW RATIONALE', 'approved 2021-06-04', 'mim-product:77 — record not available', 'Snapshot:', 'not an approval or quality certificate', '2026-07-12']) {
		expect(text).toContain(expected);
	}
});
