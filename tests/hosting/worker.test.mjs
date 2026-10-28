import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';

// Reproduce Sites' restriction, which a regular Wrangler local server lacks.
globalThis.caches = {
  get default() { throw new Error('This Worker is not permitted to access the default cache.'); }
};
mkdirSync('.sites-runtime', { recursive: true });
const outfile = resolve('.sites-runtime/worker-regression.mjs');
await build({
  entryPoints: ['dist/server/index.js'], outfile, bundle: true,
  platform: 'node', format: 'esm',
  plugins: [{
    name: 'test-runtime-env',
    setup(build) {
      build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'test' }));
      build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const env = {};' }));
    }
  }]
});
const { default: worker } = await import(pathToFileURL(outfile));
const env = { ASSETS: { fetch: async () => new Response('asset', { headers: { 'content-type': 'text/css' } }) } };
const ctx = { waitUntil: () => {} };
for (const [path, expectedStatus] of [['/', 200], ['/shortlist', 200], ['/api/mim/status', 200], ['/route-does-not-exist', 404], ['/_app/immutable/test.css', 200]]) {
  const response = await worker.fetch(new Request(`https://test.example${path}`), env, ctx);
  assert.equal(response.status, expectedStatus, path);
  const body = await response.text();
  if (path === '/') assert.match(body, /Product Explorer/);
  console.log(`${path}: ${response.status}`);
}
console.log('Sites restricted-cache regression passed.');
