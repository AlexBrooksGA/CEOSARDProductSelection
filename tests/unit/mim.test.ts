import { describe, expect, it, vi } from 'vitest';
import { assertTrusted } from '../../src/lib/server/mim/http';
import { explicitProductResolution, instrumentIndex, normaliseMimProduct, productFamily, toBrowserProduct } from '../../src/lib/server/mim/normalise';
import { collectionPath, declaredSchemaUrl, findMissionEndpoint, serverRoot } from '../../src/lib/server/mim/schema';
import { MimService } from '../../src/lib/server/mim/service';
import { parity } from './fixtures';

const fixture = parity('mim_cases.json');
const instruments = new Map(Object.entries(fixture.instruments).map(([key, value]) => [Number(key), value as Record<string, unknown>]));

describe('MIM normalisation parity with legacy Python', () => {
	it('normalises products, certification evidence and resolution exactly', () => {
		for (const testCase of fixture.normalise_product) {
			expect(normaliseMimProduct(structuredClone(testCase.input), instruments, 'https://example.test/api/products/')).toEqual(testCase.output);
		}
	});
	it('maps product families and explicit product resolution identically', () => {
		for (const testCase of fixture.product_family) expect(productFamily(testCase.input)).toBe(testCase.family);
		for (const testCase of fixture.explicit_resolution) expect(explicitProductResolution(testCase.input)).toEqual([testCase.value, testCase.display, testCase.basis]);
	});
	it('selects collection, mission and schema endpoints identically', () => {
		for (const testCase of fixture.collection_path) {
			for (const collection of ['products', 'instruments'] as const) {
				const expected = testCase[collection];
				if (typeof expected === 'string') expect(collectionPath(testCase.schema, collection)).toBe(expected);
				else expect(() => collectionPath(testCase.schema, collection)).toThrow();
			}
		}
		for (const testCase of fixture.mission_inspection) {
			if (testCase.error) expect(() => findMissionEndpoint(testCase.schema)).toThrow();
			else expect(findMissionEndpoint(testCase.schema)).toEqual({ missionPath: testCase.mission_path, missionParameters: testCase.parameters });
		}
		for (const testCase of fixture.docs_regex) expect(declaredSchemaUrl(testCase.html)).toBe(testCase.match);
		for (const testCase of fixture.server_root) expect(serverRoot(testCase.schema, testCase.schema_url, 'https://mim.example.test/api/')).toBe(testCase.root);
	});
	it('keeps instrument resolution as a display-only fallback (ported test)', () => {
		const product = normaliseMimProduct(
			{ product_id: 106, product_name: 'DESIS L2A', type: 'Surface Reflectance', instruments: [{ instrument_id: 1734, product_status: 'CEOS-ARD' }], certifications: [{ scheme: 'CEOS-ARD', approval_date: '2025-02-12' }] },
			instrumentIndex([{ instrument_id: 1734, name_short: 'DESIS', operator: 'DLR', spatial_resolution_best: 79 }]),
			'https://example.test/api/products'
		)!;
		expect(product.spatial_resolution_m).toBeNull();
		expect(product.instrument_spatial_resolution_best_m).toBe(79);
		expect(product.notes).toContain('not used for product matching');
		expect(product.ceos_ard_verified).toBe(true);
	});
	it('requires both CEOS-ARD link status and certification evidence for the assessed label', () => {
		const statusOnly = normaliseMimProduct({ product_id: 1, product_name: 'A', instruments: [{ instrument_id: 9, product_status: 'CEOS-ARD' }], certifications: [{ scheme: 'CEOS-ARD' }] }, new Map(), 'x');
		const evidenceOnly = normaliseMimProduct({ product_id: 2, product_name: 'B', instruments: [{ instrument_id: 9, product_status: 'Operational' }], certifications: [{ scheme: 'CEOS-ARD', approval_date: '2024-01-01' }] }, new Map(), 'x');
		expect(statusOnly!.ceos_ard_verified).toBe(false);
		expect(evidenceOnly!.ceos_ard_verified).toBe(false);
	});
	it('removes the searchable mission placeholder in the browser representation (recorded bug fix)', () => {
		const product = normaliseMimProduct({ product_id: 1, product_name: 'A' }, new Map(), 'x')!;
		expect(product.mission_name).toBe('Not reported by MIM product endpoint');
		expect(toBrowserProduct(product).mission_name).toBeNull();
	});
});

// ---------------------------------------------------------------- service with a fake upstream

const BASE = 'https://mim.example.test/api';
const SCHEMA = {
	paths: { '/products': { get: { tags: ['products'] } }, '/instruments': { get: { summary: 'List instruments' } }, '/missions': { get: { operationId: 'list_missions' } } }
};
const PRODUCTS = {
	products: [
		{ product_id: 1, product_name: 'Example 10m product', type: 'Surface Reflectance', instruments: [{ instrument_id: 9, product_status: 'CEOS-ARD' }], certifications: [{ scheme: 'CEOS-ARD', approval_date: '2024-01-01' }] },
		{ product_id: 2, product_name: 'Radar thing', type: 'SAR', instruments: [{ instrument_id: 9, product_status: 'Under Development' }] }
	]
};
const INSTRUMENTS = { instruments: [{ instrument_id: 9, name_short: 'EX', operator: 'ESA', spatial_resolution_best: 20 }] };

type Route = (url: URL, init: RequestInit) => Response | Promise<Response>;

function upstream(overrides: Record<string, Route> = {}) {
	const calls: string[] = [];
	const routes: Record<string, Route> = {
		'/api/docs/': () => new Response('<script>SwaggerUIBundle({ url: "/api/openapi.json" })</script>', { status: 200 }),
		'/api/openapi.json': () => Response.json(SCHEMA),
		'/api/products': () => Response.json(PRODUCTS),
		'/api/instruments': () => Response.json(INSTRUMENTS),
		...overrides
	};
	const fetchImpl = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
		const url = new URL(String(input));
		calls.push(url.href);
		const auth = new Headers(init.headers).get('authorization');
		if (auth !== `Basic ${Buffer.from('user:secret-pass').toString('base64')}`) return new Response('no', { status: 401 });
		const route = routes[url.pathname];
		return route ? route(url, init) : new Response('missing', { status: 404 });
	}) as unknown as typeof fetch;
	return { fetchImpl, calls };
}

function service(options: Partial<ConstructorParameters<typeof MimService>[0]> = {}, overrides: Record<string, Route> = {}) {
	const fake = upstream(overrides);
	let clock = 1_000_000;
	const instance = new MimService({ baseUrl: BASE, username: 'user', password: 'secret-pass', fetchImpl: fake.fetchImpl, now: () => clock, sleep: async () => undefined, ...options });
	return { instance, calls: fake.calls, advance: (ms: number) => (clock += ms) };
}

describe('MIM service', () => {
	it('does nothing upstream without configuration and keeps the catalogue usable', async () => {
		const fake = upstream();
		const instance = new MimService({ baseUrl: BASE, fetchImpl: fake.fetchImpl });
		const result = await instance.load();
		expect(result.status.state).toBe('not_configured');
		expect(result.products).toBeNull();
		expect(fake.calls).toHaveLength(0);
	});

	it('loads products with one bulk instrument request and serves the cache afterwards', async () => {
		const { instance, calls } = service();
		const result = await instance.load();
		expect(result.status.state).toBe('ready');
		expect(result.products!.map((p) => p.id)).toEqual(['mim-product:1', 'mim-product:2']);
		expect(result.products![0]!.spatial_resolution_m).toBe(10);
		expect(result.products![0]!.mission_name).toBeNull();
		expect(calls).toEqual([`${BASE}/docs/`, `${BASE}/openapi.json`, `${BASE}/products`, `${BASE}/instruments`]);
		await instance.load();
		expect(calls).toHaveLength(4);
		expect(result.status.endpoints).toEqual({ products: '/products', instruments: '/instruments' });
	});

	it('coalesces simultaneous loads into one upstream sequence', async () => {
		const { instance, calls } = service();
		const results = await Promise.all([instance.load(), instance.load(), instance.refresh(), instance.load()]);
		expect(results.every((r) => r.products?.length === 2)).toBe(true);
		expect(calls).toHaveLength(4);
	});

	it('reports authentication failure without leaking credentials and backs off before retrying', async () => {
		const { instance, calls, advance } = service({ password: 'wrong-pass' });
		const first = await instance.load();
		expect(first.status.state).toBe('error');
		expect(first.status.errorKind).toBe('auth');
		expect(first.products).toBeNull();
		expect(JSON.stringify(first)).not.toMatch(/wrong-pass|user:|Basic /);
		const callsAfterFirst = calls.length;
		const second = await instance.load();
		expect(calls.length).toBe(callsAfterFirst);
		expect(second.status.retryAfterSeconds).toBeGreaterThan(0);
		advance(31_000);
		await instance.load();
		expect(calls.length).toBeGreaterThan(callsAfterFirst);
	});

	it('times out with a bounded request timeout', async () => {
		const hang: Route = (_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))));
		const { instance } = service({ requestTimeoutMs: 30, retries: 0 }, { '/api/products': hang });
		const result = await instance.load();
		expect(result.status.errorKind).toBe('timeout');
	});

	it('treats malformed or changed schemas and responses as errors, not empty catalogues', async () => {
		for (const [overrides, kind] of [
			[{ '/api/openapi.json': () => Response.json({ nope: true }) }, 'schema'],
			[{ '/api/openapi.json': () => Response.json({ paths: { '/products': { get: {} }, '/instruments': { get: {} } } }) }, 'schema'],
			[{ '/api/docs/': () => new Response('<html>no schema</html>') }, 'schema'],
			[{ '/api/products': () => Response.json([{ product_id: 1 }]) }, 'response'],
			[{ '/api/products': () => new Response('not json') }, 'response'],
			[{ '/api/instruments': () => new Response('down', { status: 500 }) }, 'http']
		] as [Record<string, Route>, string][]) {
			const { instance } = service({}, overrides);
			const result = await instance.load();
			expect(result.products).toBeNull();
			expect(result.status.errorKind).toBe(kind);
		}
	});

	it('expires the cache after six hours and keeps the last good data when a reload fails', async () => {
		let fail = false;
		const { instance, advance } = service({}, { '/api/products': () => (fail ? new Response('x', { status: 503 }) : Response.json(PRODUCTS)) });
		await instance.load();
		advance(6 * 3_600_000 - 1);
		expect(instance.status().state).toBe('ready');
		advance(2);
		expect(instance.status().state).toBe('stale');
		fail = true;
		const result = await instance.load();
		expect(result.status.state).toBe('stale');
		expect(result.status.errorKind).toBe('http');
		expect(result.products).toHaveLength(2);
	});

	it('limits refresh with a cooldown and refreshes the MIM cache only', async () => {
		const { instance, calls, advance } = service();
		await instance.load();
		const early = await instance.refresh();
		expect(calls).toHaveLength(4);
		expect(early.status.retryAfterSeconds).toBeGreaterThan(0);
		advance(61_000);
		const later = await instance.refresh();
		expect(calls).toHaveLength(8);
		expect(later.status.state).toBe('ready');
	});

	it('retries transient upstream errors a bounded number of times', async () => {
		let attempts = 0;
		const { instance } = service({}, { '/api/products': () => (++attempts < 3 ? new Response('busy', { status: 503 }) : Response.json(PRODUCTS)) });
		expect((await instance.load()).status.state).toBe('ready');
		expect(attempts).toBe(3);
		let always = 0;
		const failing = service({}, { '/api/products': () => (always++, new Response('busy', { status: 503 })) });
		expect((await failing.instance.load()).status.errorKind).toBe('http');
		expect(always).toBe(3);
	});

	it('refuses schema-discovered URLs and redirects outside the trusted origin', async () => {
		const evilDocs = service({}, { '/api/docs/': () => new Response('url: "https://evil.example/openapi.json"') });
		const docsResult = await evilDocs.instance.load();
		expect(docsResult.status.errorKind).toBe('untrusted_url');
		expect(evilDocs.calls.some((url) => url.includes('evil.example'))).toBe(false);

		const evilServers = service({}, { '/api/openapi.json': () => Response.json({ ...SCHEMA, servers: [{ url: 'https://evil.example/api' }] }) });
		expect((await evilServers.instance.load()).status.errorKind).toBe('untrusted_url');
		expect(evilServers.calls.some((url) => url.includes('evil.example'))).toBe(false);

		const redirect = service({}, { '/api/products': () => new Response(null, { status: 302, headers: { location: 'https://evil.example/products' } }) });
		expect((await redirect.instance.load()).status.errorKind).toBe('untrusted_url');
		expect(redirect.calls.some((url) => url.includes('evil.example'))).toBe(false);

		const outsidePath = service({}, { '/api/openapi.json': () => Response.json({ ...SCHEMA, servers: [{ url: '/' }] }) });
		expect((await outsidePath.instance.load()).status.errorKind).toBe('untrusted_url');

		expect(() => assertTrusted('https://mim.example.test.evil/api', BASE)).toThrow();
	});

	it('caps response size', async () => {
		const { instance } = service({ maxResponseBytes: 200 });
		expect((await instance.load()).status.errorKind).toBe('too_large');
	});

	it('rejects base URLs that are not HTTPS (except localhost) or embed credentials', () => {
		expect(new MimService({ baseUrl: 'http://mim.example.test/api', username: 'u', password: 'p' }).configured).toBe(false);
		expect(new MimService({ baseUrl: 'https://u:p@mim.example.test/api', username: 'u', password: 'p' }).configured).toBe(false);
		expect(new MimService({ baseUrl: 'http://127.0.0.1:9999/api', username: 'u', password: 'p' }).configured).toBe(true);
	});
});
