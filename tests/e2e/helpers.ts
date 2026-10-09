import { expect, type Page } from '@playwright/test';

export async function open(page: Page, path = '/'): Promise<void> {
	await page.goto(path);
	await expect(page.locator('body[data-hydrated="true"]')).toBeAttached();
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
