import { expect, type Page } from '@playwright/test';

export async function open(page: Page, path = '/'): Promise<void> {
	await page.goto(path);
	await expect(page.locator('body[data-hydrated="true"]')).toBeAttached();
}

/**
 * Open Discover past the purpose journey: a fresh session (or a bare `/?v=1` link) shows the
 * purpose entry first; "Skip to catalogue" gives the neutral browse state.
 */
export async function browse(page: Page, path = '/'): Promise<void> {
	await open(page, path);
	const skip = page.getByRole('button', { name: 'Skip to catalogue' });
	if (await skip.isVisible()) await skip.click();
	await expect(page.getByLabel('Search product and mission names')).toBeVisible();
}

export const cards = (page: Page) => page.locator('article.card');

export async function cardTitles(page: Page): Promise<string[]> {
	return cards(page).locator('h3').allInnerTexts();
}

export function card(page: Page, name: string) {
	return cards(page).filter({ has: page.getByRole('heading', { name, exact: true }) });
}

export async function settle(page: Page): Promise<void> {
	// Debounced edits commit to the URL after a short pause.
	await page.waitForTimeout(600);
}
