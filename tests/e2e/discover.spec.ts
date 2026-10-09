import { expect, test } from '@playwright/test';
import { card, cardTitles, cards, open, settle } from './helpers';

test('opens in a neutral browse state with the assessed scope visibly selected', async ({ page }) => {
	await open(page);
	await expect(page.getByRole('heading', { level: 2, name: /Browse products/ })).toBeVisible();
	await expect(cards(page)).toHaveCount(26);
	await expect(page.getByLabel('Catalogue scope')).toHaveValue('CEOS-ARD assessed only');
	await expect(page.getByLabel('Measurement family')).toHaveValue('All product families');
	await expect(page.getByRole('list', { name: 'Active restrictions' })).toHaveCount(0);
	await expect(page.getByText('No screening criteria are active.')).toBeVisible();
	await expect(page.getByText(/launch/i)).toHaveCount(0);
	const titles = await cardTitles(page);
	expect(titles).toEqual([...titles].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
});

test('applies a built-in profile with preview, retained constraints and undo; values are unchanged', async ({ page }) => {
	await open(page);
	await page.getByLabel('Search product and mission names').fill('sentinel');
	await settle(page);
	await page.getByRole('button', { name: 'Starting points and my profiles' }).click();
	const dialog = page.getByRole('dialog', { name: 'Profiles' });
	await dialog.getByRole('button', { name: 'Preview Monitor Change Over Time' }).click();
	await expect(dialog.getByRole('row', { name: /Nominal revisit Not set ≤ 5 days · Required/ })).toBeVisible();
	await expect(dialog.getByText(/Kept as they are:.*Search “sentinel”/)).toBeVisible();
	await dialog.getByRole('button', { name: 'Apply profile' }).click();
	await expect(page).toHaveURL(/rev=req%3A5|rev=req:5/);
	await expect(page).toHaveURL(/res=pref%3A30|res=pref:30/);
	await expect(page.getByLabel('Measurement family')).toHaveValue('Surface Reflectance');
	await expect(page.getByLabel('Search product and mission names')).toHaveValue('sentinel');
	await expect(page.getByText('Applied: Monitor Change Over Time')).toBeVisible();
	await page.getByRole('button', { name: /Undo: Applied/ }).click();
	await expect(page.getByLabel('Measurement family')).toHaveValue('All product families');
	await expect(page).not.toHaveURL(/rev=/);
});

test('edits criterion importance inline, marks the profile Modified and restores defaults', async ({ page }) => {
	await open(page, '/?v=1&fam=sr&res=req:10&rev=req:30&p=map-land-features');
	await expect(page.getByText('Applied: Map Land and Features')).toBeVisible();
	await expect(page.getByText('Modified')).toHaveCount(0);
	await page.getByRole('radiogroup', { name: 'Spatial resolution importance' }).getByRole('radio', { name: 'Preferred' }).check();
	await expect(page).toHaveURL(/res=pref%3A10|res=pref:10/);
	await expect(page.locator('.profile-row').getByText('Modified')).toBeVisible();
	await page.getByRole('button', { name: 'Restore profile defaults' }).click();
	await expect(page).toHaveURL(/res=req%3A10|res=req:10/);
	const input = page.locator('#criterion-revisit_days-value');
	await input.fill('12.5');
	await settle(page);
	await expect(page).toHaveURL(/rev=req%3A12\.5|rev=req:12\.5/);
	await input.fill('400');
	await expect(page.getByRole('alert')).toContainText('from 0.1 to 365');
});

test('distinguishes reported mismatch from missing evidence and keeps manual-check routes counted', async ({ page }) => {
	await open(page, '/?v=1&fam=sr&res=req:10&rev=req:5');
	await expect(page.getByText(/2\s+meet required criteria/)).toBeVisible();
	const outside = page.locator('.result-section', { has: page.getByRole('heading', { name: /Reported outside a requirement/ }) });
	const evidence = page.locator('.result-section', { has: page.getByRole('heading', { name: /Need evidence for a requirement/ }) });
	await expect(outside.locator('article.card')).toHaveCount(0);
	await outside.getByRole('button', { name: /Show/ }).click();
	const desis = card(page, 'DESIS L2A');
	await expect(desis).toContainText('Reported outside: spatial resolution');
	await expect(desis).toContainText('Needs evidence: nominal revisit');
	await evidence.getByRole('button', { name: /Show/ }).click();
	const outsideCount = await outside.locator('article.card').count();
	const evidenceCount = await evidence.locator('article.card').count();
	await expect(page.getByText(`${outsideCount} reported outside a requirement`)).toBeVisible();
	await expect(page.getByText(`${evidenceCount} need evidence`)).toBeVisible();
	await expect(evidence.getByRole('heading', { name: 'DESIS L2A' })).toHaveCount(0);
});

test('clear criteria keeps the catalogue scope and shortlist; no-results state names recovery actions', async ({ page }) => {
	await open(page, '/?v=1&scope=all&q=zzzz-nothing&fam=st&sl=landsat-c2-sr');
	await expect(page.getByText('No products match the current settings.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Remove search “zzzz-nothing”', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Clear criteria', exact: true }).first().click();
	await expect(cards(page)).toHaveCount(26);
	await expect(page.getByLabel('Catalogue scope')).toHaveValue('All statuses');
	await expect(page.getByRole('link', { name: /Shortlist & compare \(1\)/ })).toBeVisible();
});

test('browser back and forward restore the represented state', async ({ page }) => {
	await open(page);
	await page.getByRole('button', { name: 'Starting points and my profiles' }).click();
	await page.getByRole('button', { name: 'Preview Map Land and Features' }).click();
	await page.getByRole('button', { name: 'Apply profile' }).click();
	await expect(page.getByLabel('Measurement family')).toHaveValue('Surface Reflectance');
	await page.goBack();
	await expect(page.getByLabel('Measurement family')).toHaveValue('All product families');
	await page.goForward();
	await expect(page.getByLabel('Measurement family')).toHaveValue('Surface Reflectance');
});
