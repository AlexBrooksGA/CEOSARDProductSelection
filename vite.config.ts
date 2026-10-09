import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		fs: {
			// Bundled catalogue JSON and agency marks live at the repository root.
			allow: ['data', 'assets']
		}
	},
	test: {
		include: ['tests/unit/**/*.test.ts'],
		environment: 'node',
		restoreMocks: true
	}
});
