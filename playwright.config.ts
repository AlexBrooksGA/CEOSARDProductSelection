import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the production build (`npm run build` first), served by
 * `node build` exactly as in deployment:
 * - "catalogue": no MIM credentials (clean setup).
 * - "mim": credentials pointing at a local mock MIM API (no live service or secrets).
 * Set PW_CHROMIUM_PATH to use a preinstalled Chromium instead of `npx playwright install`.
 */
const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};
const base = { env: { HOST: '127.0.0.1', MIMS_API_USERNAME: '', MIMS_API_PASSWORD: '' } };

export default defineConfig({
	testDir: 'tests/e2e',
	outputDir: 'test-results',
	timeout: 30_000,
	expect: { timeout: 7_000 },
	reporter: [['list']],
	use: { trace: 'retain-on-failure', launchOptions },
	webServer: [
		{
			command: 'node build',
			url: 'http://127.0.0.1:4173',
			env: { ...base.env, PORT: '4173', ORIGIN: 'http://127.0.0.1:4173' },
			reuseExistingServer: false
		},
		{ command: 'node tests/e2e/mock-mim.mjs 4599', port: 4599, reuseExistingServer: false },
		{
			command: 'node build',
			url: 'http://127.0.0.1:4174',
			env: {
				HOST: '127.0.0.1',
				PORT: '4174',
				ORIGIN: 'http://127.0.0.1:4174',
				MIMS_API_BASE_URL: 'http://127.0.0.1:4599/api',
				MIMS_API_USERNAME: 'e2e-user',
				MIMS_API_PASSWORD: 'e2e-secret',
				MIMS_REFRESH_COOLDOWN_SECONDS: '30',
				MIMS_FAILURE_BACKOFF_SECONDS: '0'
			},
			reuseExistingServer: false
		}
	],
	projects: [
		{ name: 'catalogue', testIgnore: /mim\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4173' } },
		{ name: 'mim', testMatch: /mim\.spec\.ts/, fullyParallel: false, use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4174' } }
	]
});
