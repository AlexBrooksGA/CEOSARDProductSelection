import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const sitesBuild = process.env.DEPLOY_TARGET === 'sites';
const sitesAdapter = sitesBuild ? (await import('@sveltejs/adapter-cloudflare')).default : null;

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		runes: true
	},
	kit: {
		// Default: one Node.js process. build:sites selects the hosted Worker output.
		adapter: sitesBuild ? sitesAdapter() : adapter({ out: 'build', precompress: true }),
		csp: {
			mode: 'nonce',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:'],
				'font-src': ['self'],
				'connect-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none']
			}
		},
		version: { pollInterval: 0 }
	}
};

export default config;
