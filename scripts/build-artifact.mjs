#!/usr/bin/env node
/**
 * Build a static, server-free copy of the explorer to publish as a Claude Artifact (or any static host).
 *
 *   node scripts/build-artifact.mjs [output-dir]      default: artifact-build/
 *
 * The repository app is not changed. A patched copy is built in .artifact-work/:
 * - Bundled data (curated catalogue, C-QAS reports, MIM snapshot, pictures) loads in the browser through
 *   universal load functions; there are no server routes, so live MIM loading is off.
 * - Client-side rendering only, relative asset paths, internal links prefixed with the runtime base,
 *   and no Content Security Policy meta (the host sets its own).
 * The output's index.html is a single-page shell; navigation happens in the page.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = resolve(ROOT, '.artifact-work');
const OUT = resolve(process.argv[2] ?? resolve(ROOT, 'artifact-build'));

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
for (const entry of ['src', 'data', 'assets', 'static', 'package.json', 'tsconfig.json', 'vite.config.ts']) cpSync(resolve(ROOT, entry), resolve(WORK, entry), { recursive: true });
symlinkSync(resolve(ROOT, 'node_modules'), resolve(WORK, 'node_modules'), 'dir');

const path = (relative) => resolve(WORK, relative);
function patch(relative, pairs) {
	let text = readFileSync(path(relative), 'utf8');
	for (const [from, to] of pairs) {
		if (!text.includes(from)) throw new Error(`build-artifact: ${relative} no longer contains: ${from.slice(0, 80)}`);
		text = text.replace(from, to);
	}
	writeFileSync(path(relative), text);
}

// --- data loading moves from server-only modules to universal load functions
mkdirSync(path('src/lib/data'), { recursive: true });
cpSync(path('src/lib/server/catalogue.ts'), path('src/lib/data/catalogue.ts'));
rmSync(path('src/routes/+layout.server.ts'));
rmSync(path('src/routes/products/[id]/+page.server.ts'));
rmSync(path('src/routes/api'), { recursive: true, force: true });

writeFileSync(
	path('src/routes/+layout.ts'),
	`import { error } from '@sveltejs/kit';
import { bundledData } from '$lib/data/catalogue';
import type { LayoutLoad } from './$types';

export const ssr = false;
export const prerender = false;

/** Offline copy: the bundled snapshot is shown; live MIM loading needs the server version. */
const MIM_OFFLINE = {
	configured: false,
	state: 'not_configured' as const,
	message: 'Live loading from the CEOS MIM database needs the server version of the explorer. This offline copy still shows the bundled MIM values, marked with a purple asterisk.',
	errorKind: 'not_configured',
	productCount: 0,
	fetchedAt: null,
	expiresAt: null,
	lastAttemptAt: null,
	ttlHours: 6,
	retryAfterSeconds: null,
	endpoints: null,
	host: null,
	disabledReason: 'off' as const,
	publicAccess: true,
	edition: null
};

export const load: LayoutLoad = () => {
	const result = bundledData();
	if ('error' in result) error(500, \`The bundled catalogue could not be loaded: \${result.error}\`);
	const { data } = result;
	(globalThis as Record<string, unknown>).__ARTIFACT_PROVENANCE__ = data.provenance;
	return {
		products: data.catalogue.products,
		profiles: data.profiles,
		agencyMarks: data.agencyMarks,
		cqasSummaries: data.cqasSummaries,
		mimSummaries: data.mimSummaries,
		productVisuals: data.productVisuals,
		mimSource: data.mimSnapshot?.source ?? null,
		notFound: Object.fromEntries(
			Object.entries(data.provenance).map(([id, fields]) => [id, Object.fromEntries(Object.values(fields).filter((row) => row.confidence === 'not_found').map((row) => [row.field_name, row.date_checked]))])
		) as Record<string, Record<string, string>>,
		catalogueSource: data.catalogue.source,
		mim: MIM_OFFLINE
	};
};
`
);

writeFileSync(
	path('src/routes/products/[id]/+page.ts'),
	`import { PRODUCT_ID_PATTERN } from '$lib/domain/catalogue';
import { mimDetailsFor } from '$lib/domain/mim';
import { bundledData } from '$lib/data/catalogue';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const id = params.id;
	if (!PRODUCT_ID_PATTERN.test(id)) return { id, valid: false, provenance: null, mimProduct: null, mimDetails: null, missionVisuals: {}, cqasReport: null };
	const result = bundledData();
	const provenance = 'data' in result ? (result.data.provenance[id] ?? null) : null;
	const cqasReport = 'data' in result ? (result.data.cqasReports[id] ?? null) : null;
	const mimDetails = 'data' in result ? mimDetailsFor(result.data.mimSnapshot, id) : null;
	const allVisuals = 'data' in result ? result.data.missionVisuals : {};
	const missionVisuals = Object.fromEntries((mimDetails?.missions ?? []).filter((m) => allVisuals[String(m.mission_id)]).map((m) => [String(m.mission_id), allVisuals[String(m.mission_id)]!]));
	return { id, valid: true, provenance, mimProduct: null, mimDetails, missionVisuals, cqasReport };
};
`
);

// --- client store: base-prefixed links, provenance from the bundle
patch('src/lib/state/app.svelte.ts', [
	["import { goto } from '$app/navigation';", "import { goto } from '$app/navigation';\nimport { base } from '$app/paths';"],
	['		return `${path}?${this.query}`;', '		return `${base}${path}?${this.query}`;'],
	[
		'const response = await fetch(`/api/provenance?ids=${encodeURIComponent(missing.join(\',\'))}`);',
		"const bundle = ((globalThis as Record<string, unknown>).__ARTIFACT_PROVENANCE__ ?? {}) as Record<string, unknown>;\n\t\t\tconst response = new Response(JSON.stringify({ provenance: Object.fromEntries(missing.filter((id) => bundle[id]).map((id) => [id, bundle[id]])) }));"
	]
]);
patch('src/lib/components/purpose/depth-scene.ts', [
	["export const IMAGE_BASE = '/images/purpose-journey';", "import { assets } from '$app/paths';\nexport const IMAGE_BASE = `${assets}/images/purpose-journey`;"]
]);
patch('src/routes/products/[id]/+page.svelte', [
	["		cameFromResults = from?.url.pathname === '/';", "		cameFromResults = from?.url.pathname === `${base}/`;"],
	["	import { afterNavigate } from '$app/navigation';", "	import { afterNavigate } from '$app/navigation';\n\timport { base } from '$app/paths';"]
]);

// --- no nonce in a static page
patch('src/app.html', [['<script nonce="%sveltekit.nonce%">', '<script>']]);

// --- static build: a single-page shell with relative paths
writeFileSync(
	path('svelte.config.js'),
	`import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const out = ${JSON.stringify(resolve(WORK, 'artifact-out'))};

/** Minimal static adapter: client files plus a single-page fallback shell. */
const adapter = {
	name: 'artifact-static',
	async adapt(builder) {
		builder.rimraf(out);
		builder.writeClient(out);
		builder.writePrerendered(out);
		await builder.generateFallback(out + '/index.html');
	}
};

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	compilerOptions: { runes: true },
	kit: {
		adapter,
		// Some static hosts (including Claude Artifacts) reserve names starting with "_".
		appDir: 'app',
		paths: { relative: true },
		prerender: { entries: [] },
		version: { pollInterval: 0 }
	}
};
`
);

execFileSync('npx', ['svelte-kit', 'sync'], { cwd: WORK, stdio: 'inherit' });
execFileSync('npx', ['vite', 'build'], { cwd: WORK, stdio: 'inherit', env: { ...process.env, MIMS_API_BASE_URL: 'off' } });

// --- copy out; make index.html a fragment the artifact host can wrap
rmSync(OUT, { recursive: true, force: true });
cpSync(resolve(WORK, 'artifact-out'), OUT, { recursive: true });
let html = readFileSync(resolve(OUT, 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? '';
if (!body.includes('kit.start')) throw new Error('build-artifact: unexpected fallback page shape');
// The fallback shell is written with absolute paths; make them relative and compute the base at runtime
// from the page's own location, so the copy works from any folder on any host.
const relative = (text) =>
	text
		.replaceAll('href="/app/', 'href="./app/')
		.replaceAll('import("/app/', 'import("./app/')
		.replaceAll('href="/favicon.svg"', 'href="./favicon.svg"')
		.replace(/base: ""/, 'base: new URL(".", location).pathname.slice(0, -1)');
html = `<title>CEOS-ARD Product Explorer</title>\n${relative(head).replace(/<meta charset="utf-8" \/>|<meta name="viewport"[^>]*>|<title>[^<]*<\/title>/g, '').trim()}\n<div data-sveltekit-preload-data="hover" style="display: contents">${relative(body).trim()}</div>\n`;
if (/(href=|import\()"\/app\//.test(html) || html.includes('base: ""')) throw new Error('build-artifact: absolute paths remain in index.html');
writeFileSync(resolve(OUT, 'index.html'), html);
if (!existsSync(resolve(OUT, 'app'))) throw new Error('build-artifact: no app/ output');
console.log(`Artifact build written to ${OUT}`);
