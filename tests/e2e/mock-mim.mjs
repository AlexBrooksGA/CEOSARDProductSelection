// Minimal stand-in for the authenticated MIM API, used only by end-to-end tests.
// Usage: node tests/e2e/mock-mim.mjs <port>. Control: POST /__control?mode=ok|fail|auth.
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 4599);
const AUTH = `Basic ${Buffer.from('e2e-user:e2e-secret').toString('base64')}`;
let mode = 'ok';
const stats = { requests: 0 };

const schema = {
	paths: {
		'/products': { get: { tags: ['products'] } },
		'/instruments': { get: { summary: 'List instruments' } },
		'/missions': { get: { operationId: 'list_missions' } }
	}
};
const products = Array.from({ length: 30 }, (_, index) => ({
	product_id: 900 + index,
	product_name: index === 0 ? 'E2E Optical 10m SR' : `E2E Product ${String(index).padStart(2, '0')}`,
	type: index % 2 ? 'Normalised Radar Backscatter' : 'Surface Reflectance',
	category: index % 2 ? 'SAR' : 'Optical',
	format: 'GeoTIFF',
	instruments: [{ instrument_id: index % 2 ? 2 : 1, product_status: index < 2 ? 'CEOS-ARD' : 'Under Development', access_url: index === 0 ? 'https://example.org/access' : undefined }],
	certifications: index < 2 ? [{ scheme: 'CEOS-ARD', spec_version: 'v5.0', approval_date: '2025-01-01', review_url: 'https://example.org/review' }] : []
}));
const instruments = [
	{ instrument_id: 1, name_short: 'OPT', operator: 'E2E Agency', spatial_resolution_best: 10, instrument_types: 'Optical imager' },
	{ instrument_id: 2, name_short: 'RAD', operator: 'E2E Agency', spatial_resolution_best: 5, instrument_types: 'SAR' }
];

createServer((request, response) => {
	const url = new URL(request.url, `http://127.0.0.1:${port}`);
	if (url.pathname === '/__control') {
		mode = url.searchParams.get('mode') ?? mode;
		response.end(JSON.stringify({ mode }));
		return;
	}
	if (url.pathname === '/__stats') {
		response.end(JSON.stringify(stats));
		return;
	}
	stats.requests += 1;
	if (request.headers.authorization !== AUTH || mode === 'auth') {
		response.writeHead(401).end('unauthorised');
		return;
	}
	if (mode === 'fail') {
		response.writeHead(500).end('failure');
		return;
	}
	const json = (body) => {
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify(body));
	};
	if (url.pathname === '/api/docs/') {
		response.writeHead(200, { 'content-type': 'text/html' });
		response.end('<script>SwaggerUIBundle({ url: "/api/openapi.json" })</script>');
	} else if (url.pathname === '/api/openapi.json') json(schema);
	else if (url.pathname === '/api/products') json({ products });
	else if (url.pathname === '/api/instruments') json({ instruments });
	else response.writeHead(404).end('not found');
}).listen(port, '127.0.0.1');
