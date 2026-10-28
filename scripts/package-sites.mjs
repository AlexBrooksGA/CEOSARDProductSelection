import { mkdirSync, cpSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';

// The official SvelteKit adapter emits the Worker and its static assets.
// Sites accepts a bundled ESM Worker at dist/server/index.js.
mkdirSync('dist/server', { recursive: true });
await build({
  entryPoints: ['.svelte-kit/cloudflare-worker.js'],
  outfile: 'dist/server/index.js',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  conditions: ['workerd', 'worker', 'browser'],
  target: 'es2022',
  external: ['node:*', 'cloudflare:*'],
  plugins: [{
    name: 'sites-disable-adapter-http-cache',
    setup(build) {
      build.onLoad({ filter: /cloudflare-worker\.js$/ }, ({ path }) => {
        const source = readFileSync(path, 'utf8');
        const cacheBinding = 'var s = caches.default;';
        if (source.split(cacheBinding).length !== 2) {
          throw new Error('Cloudflare adapter cache binding changed; review Sites compatibility before publishing.');
        }
        // Sites does not permit the default Cloudflare cache. Only disable the
        // adapter's optional HTTP response cache; application MIM caching stays intact.
        return { contents: source.replace(cacheBinding,
          'var s = { async match() { return undefined; }, async put() {} };'), loader: 'js' };
      });
    }
  }],
  minify: true,
  sourcemap: false
});
cpSync('.svelte-kit/cloudflare', 'dist/client', { recursive: true });
console.log('Prepared Sites Worker and static assets.');
