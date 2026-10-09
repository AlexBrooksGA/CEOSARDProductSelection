import { expect, test } from '@playwright/test';
import { open } from './helpers';

test('custom profile create, validate (draft kept), apply, rename, update and delete — session only', async ({ page }) => {
	await open(page, '/?v=1&fam=sar&res=req:20');
	await page.getByRole('button', { name: 'Starting points and my profiles' }).click();
	const dialog = page.getByRole('dialog', { name: 'Profiles' });
	await expect(dialog.getByText(/Saved in this browser tab’s session only/)).toBeVisible();
	await dialog.getByLabel('Profile name').fill('ma');
	await dialog.getByLabel('Short description (optional)').fill('Radar mapping');
	await dialog.getByRole('button', { name: 'Save profile' }).click();
	await expect(dialog.getByRole('alert')).toHaveText('Enter a profile name with at least three characters.');
	await expect(dialog.getByLabel('Short description (optional)')).toHaveValue('Radar mapping');
	await dialog.getByLabel('Profile name').fill('map land and FEATURES');
	await dialog.getByRole('button', { name: 'Save profile' }).click();
	await expect(dialog.getByRole('alert')).toHaveText('A profile with that name already exists.');
	await dialog.getByLabel('Profile name').fill('Radar shortlist');
	await dialog.getByRole('button', { name: 'Save profile' }).click();
	await expect(dialog.locator('.profile-item strong', { hasText: /^Radar shortlist$/ })).toBeVisible();
	await dialog.getByRole('button', { name: 'Close' }).click();

	// Change criteria, then apply the custom profile: its saved values come back.
	await page.getByLabel('Measurement family').selectOption('Surface Reflectance');
	await page.getByRole('button', { name: 'Starting points and my profiles' }).click();
	await dialog.getByRole('button', { name: 'Preview Radar shortlist' }).click();
	await dialog.getByRole('button', { name: 'Apply profile' }).click();
	await expect(page.getByLabel('Measurement family')).toHaveValue('Synthetic Aperture Radar');
	await expect(page.getByText('Applied: Radar shortlist')).toBeVisible();
	// Custom profiles are not shared: the link carries resolved criteria only.
	expect(page.url()).not.toContain('custom-');
	expect(page.url()).toMatch(/res=req(%3A|:)20/);

	// Edit criteria → Modified → explicit save to the profile.
	await page.getByRole('radiogroup', { name: 'Spatial resolution importance' }).getByRole('radio', { name: 'Preferred' }).check();
	await expect(page.locator('.profile-row').getByText('Modified')).toBeVisible();
	await page.getByRole('button', { name: 'Starting points and my profiles' }).click();
	await dialog.getByRole('button', { name: 'Save current criteria to “Radar shortlist”' }).click();
	await dialog.getByRole('button', { name: 'Edit Radar shortlist' }).click();
	await dialog.getByLabel('Profile name').fill('Renamed radar shortlist');
	await dialog.getByRole('button', { name: 'Save changes' }).click();
	await expect(dialog.locator('.profile-item strong', { hasText: /^Renamed radar shortlist$/ })).toBeVisible();
	await expect(dialog.getByText('Spatial resolution ≤ 20 m · Preferred').last()).toBeVisible();

	// Survives reload in the same tab.
	await dialog.getByRole('button', { name: 'Close' }).click();
	await page.reload();
	await expect(page.locator('body[data-hydrated="true"]')).toBeAttached();
	await page.getByRole('button', { name: 'Starting points and my profiles' }).click();
	await expect(dialog.locator('.profile-item strong', { hasText: /^Renamed radar shortlist$/ })).toBeVisible();
	await dialog.getByRole('button', { name: 'Delete Renamed radar shortlist' }).click();
	await dialog.getByRole('button', { name: 'Confirm delete' }).click();
	await expect(dialog.getByText('No session profiles yet.')).toBeVisible();
	await expect(page.getByLabel('Measurement family', { exact: true })).toHaveValue('Synthetic Aperture Radar');
});

test('works in memory with a visible notice when session storage is unavailable', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(window, 'sessionStorage', {
			get() {
				throw new DOMException('blocked', 'SecurityError');
			}
		});
	});
	await open(page, '/?v=1');
	await expect(page.getByText(/Browser session storage is unavailable/)).toBeVisible();
	await page.getByRole('button', { name: 'Add to shortlist Sentinel-2 Level-2A' }).click();
	await expect(page.getByRole('link', { name: /Shortlist & compare \(1\)/ })).toBeVisible();
	await page.getByRole('link', { name: /Shortlist & compare \(1\)/ }).click();
	await page.getByLabel('Investigation notes').fill('kept in memory');
	await page.getByRole('link', { name: 'Discover', exact: true }).click();
	await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Shortlist & compare/ }).click();
	await expect(page.getByLabel('Investigation notes')).toHaveValue('kept in memory');
});

test('corrupt stored session data is reset with a message', async ({ page }) => {
	await page.addInitScript(() => sessionStorage.setItem('ceos-ard-explorer', '{broken'));
	await open(page);
	await expect(page.getByText('Saved session data could not be read and was reset.')).toBeVisible();
});
