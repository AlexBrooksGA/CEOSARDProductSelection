# Sites deployment

Public URL: https://ceos-ard-product-explorer.treetime.chatgpt.site/

The application source, catalogue and browser assets match published Sites version 3 (Sites source commit `1557610793b25b83d3c76ffc8036f1b2775258a6`). That commit belongs to the separate Sites repository; it is recorded here for traceability. The GitHub repository retains the rebuild's original history and adds the hosting configuration to the same source tree.

## Build and check

```bash
npm ci
npm run check
npm test
npm run build:sites
npm run test:hosting
```

`build:sites` selects the official SvelteKit Cloudflare adapter for that command and packages `dist/server/index.js` plus `dist/client`. `npm run build` continues to produce the standard Node.js build in `build/`. Both builds use the same screens, catalogue, matching rules, profiles, comparison and provenance.

The adapter's optional default Cloudflare HTTP cache is disabled during packaging because Sites does not permit access to it. The build fails if the expected adapter patch target changes. The hosting regression test makes default-cache access throw and verifies the home page, shortlist, API, missing-route response and asset routing. This is separate from the application's MIM cache.

## Runtime settings and access

MIM requests, credentials, validation and caching stay on the server. Configure `MIMS_API_BASE_URL`, `MIMS_API_USERNAME` and `MIMS_API_PASSWORD` as Sites runtime secrets. Never commit `.env` or credentials, and never put them in the build or hosting manifest. Existing Sites secrets remain managed by Sites; they are not stored in this repository.

MIM memory caching, refresh cooldown and failure backoff are per Worker isolate, may reset when an isolate is retired and are not shared between locations. No persistent shared cache or database is configured.

The existing Site is public. Sharing is managed by Sites. `.openai/hosting.json` identifies that Site; publishing should update it rather than create another one. Use the Sites plugin's source, packaging and deployment workflow. `wrangler.jsonc` supplies adapter output settings and local runtime configuration; it does not deploy outside Sites.

Pushing to GitHub does not automatically republish the Site. Deploy a verified build through Sites when application changes should go live.
