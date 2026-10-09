import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../..');

export function readJson<T = any>(relative: string): T {
	return JSON.parse(readFileSync(resolve(ROOT, relative), 'utf-8')) as T;
}

export function readText(relative: string): string {
	return readFileSync(resolve(ROOT, relative), 'utf-8');
}

export function parity<T = any>(name: string): T {
	return readJson<T>(`tests/fixtures/parity/${name}`);
}
