# CEOS-ARD Product Explorer

**Public application:** [CEOS-ARD Product Explorer](https://ceos-ard-product-explorer.treetime.chatgpt.site/).

This repository includes the application published as Sites version 3, with its guided purpose journey and hosting compatibility fix. One source tree supports the standard Node.js build (`npm run build`) and the Sites Worker build (`npm run build:sites`). See [Sites deployment](docs/SITES_DEPLOYMENT.md).

A web application for discovering, shortlisting and comparing Earth observation data products assessed against a CEOS Analysis Ready Data (CEOS-ARD) Product Family Specification (PFS). It bundles a researched catalogue of 26 assessed products and can optionally load product records from the CEOS Missions, Instruments and Measurements (MIM) database.

CEOS-ARD assessment describes conformance with a PFS; it does not certify suitability for a particular application. Built-in profiles are illustrative starting points, not official CEOS requirements. The explorer does not download or validate imagery.

**Stack:** SvelteKit 2 + Svelte 5 + TypeScript, plain CSS, one Node.js process (`@sveltejs/adapter-node`). Filtering, matching and comparison run in the browser; MIM requests, credentials, validation and caching run on the server. No database, accounts or Python at runtime. The reasons for this choice are in [`docs/rebuild/AUDIT.md`](docs/rebuild/AUDIT.md#6-stack-decision).

## Quick start

Requires **Node.js 22.12 or newer**.

```bash
npm ci            # exact locked dependencies
npm run dev       # development server at http://localhost:5173
```

Production build and run (the same as deployment):

```bash
npm run build
npm start         # node --env-file-if-exists=.env build → http://localhost:3000
```

On Windows, double-click `run_app.bat` (installs, builds and starts, then opens the browser).

A clean setup needs no configuration: the curated catalogue works offline, and MIM records load from the public CEOS Database API on request.

## MIM (CEOS Missions, Instruments and Measurements database)

MIM works with no configuration: the server reads the public **CEOS Database API** at `https://ceos-capabilities.org/api` (CC BY 4.0, attribution "CEOS MIM Database, https://database.eohandbook.com"). Loading is still deliberate: nothing is fetched until someone selects **Load MIM products**. The MIM panel shows the database edition and data date.

Optional settings (`cp .env.example .env`; `.env` is git-ignored):

| Variable | Purpose |
|---|---|
| `MIMS_API_BASE_URL` | API root. Default `https://ceos-capabilities.org/api`. HTTPS required (http only for localhost). Set to `off` to turn MIM off. |
| `MIMS_API_KEY` | Free key for higher rate limits (anonymous use allows 30 requests per second per IP). Sent as `X-API-Key`, server-side only. |
| `MIMS_API_USERNAME`, `MIMS_API_PASSWORD` | Only for an older authenticated MIM deployment. Set both or neither. |
| `MIMS_CACHE_TTL_SECONDS` | Cache freshness, default 21600 (6 hours). |
| `MIMS_REFRESH_COOLDOWN_SECONDS` | Minimum gap between upstream refreshes, default 60. |
| `MIMS_FAILURE_BACKOFF_SECONDS` | Pause after a failed load before retrying upstream, default 30. |

Keys and credentials are read only on the server, never sent to the browser, put in URLs or logged. Requests and schema-discovered URLs are restricted to the configured origin and API path. Behind an outbound proxy, run Node 22.21+ with `NODE_USE_ENV_PROXY=1` so its built-in fetch uses `HTTPS_PROXY`. Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#mim-integration).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server. |
| `npm run check` | `svelte-kit sync` + `svelte-check` (TypeScript and Svelte), warnings fail. |
| `npm test` | Vitest unit and Python-parity tests. |
| `npm run build` | Production build into `build/`. |
| `npm start` | Run the built Node app (loads `.env` if present). |
| `npm run test:e2e` | Playwright tests against the **built** app (run `npm run build` first; `npx playwright install chromium` once). Uses a local mock MIM API — no live credentials. |
| `npm run verify` | All of the above in order. |
| `npm run parity:fixtures` | Regenerate parity fixtures from the legacy Python reference (development only). |

## Using the explorer

- **Start with your purpose.** A fresh visit opens a short sentence builder — *I'm [new to Earth observation data]. I want to [monitor change] in [wetlands], to understand [seasonal changes in inundation], across [Africa] over [the past decade]* — with optional output, measurement, detail and frequency. The sentence appears one part at a time as each is answered or skipped, and **Find candidate products** is available from the first answer. A one-line summary says where the catalogue will start; **Review starting setup** shows the proposed filters and why, what the catalogue can't check, the checks you'll see on each product (with sources) and what stays unchanged. Your experience level only changes which details open by default; region and period are private context. Nothing changes until **Find candidate products**; **Skip to catalogue** (top right) goes straight to browsing. Afterwards **Your purpose** above the results offers Edit, Clear purpose and Undo, and flags *Filters adjusted since setup*. Qualitative answers ("small features", "across each season") never become numeric limits; only values you type do. The guidance is illustrative and not reviewed by CEOS or domain experts (see [`docs/purpose-journey/GUIDANCE.md`](docs/purpose-journey/GUIDANCE.md)).
- **Discover** (after skipping, or from any link with criteria) shows the catalogue; with no criteria it is a neutral browse state: all measurement families, the **CEOS-ARD assessed products** scope, no screening criteria and no launch-year cut-off.
- Add **Spatial resolution** or **Nominal revisit** criteria (more under **More filters**) and set each to **Required**, **Preferred** or **Ignore** inline. Required criteria separate products that meet reported values from those **reported outside a requirement** or **needing evidence**; both groups are counted and can be opened. Preferences only change the order, which is never a quality ranking.
- **Profiles** offer illustrative starting points and session-only custom profiles, with a preview of what changes, undo, a *Modified* marker and explicit saving.
- **Clear criteria** removes search, family and technical restrictions but keeps the catalogue scope; **Restore profile defaults** re-applies the applied profile.
- **Product details** separate *CEOS-ARD assessment*, *Measured quality evidence* and *My requirements and open checks*, with sourced access, documentation and provenance.
- **Shortlist & compare** keeps any number of candidates (up to 60), compares two or three in aligned rows, and holds optional notes. **Copy selection summary** produces a dated, provisional decision record.
- Links reproduce criteria and selections (see [`docs/STATE_CONTRACT.md`](docs/STATE_CONTRACT.md)) and, when a purpose is applied, its public key and guidance version; notes, profiles, purpose descriptions, area, period and check records stay in the browser tab's session.
- With a purpose applied, product details, the comparison (requirements and purpose checks first) and the copied summary include the purpose checks, next actions and your own check records.

## Repository layout

```
src/lib/domain/        Pure TypeScript: models, catalogue normalisation, matching, filters,
                       presentation, comparison, profiles, summary (no UI, network or storage)
src/lib/server/        Server-only: bundled data loading, MIM client/cache (src/lib/server/mim)
src/lib/state/         URL contract, sessionStorage adapter, per-tab client store
src/lib/components/    Svelte components
src/routes/            Pages (/, /products/[id], /shortlist) and API endpoints (/api/mim/*, /api/provenance)
data/                  Version-controlled catalogue, profiles, research log, fallback/status files
assets/agency_logos/   Vendored agency marks + manifest
tests/unit/            Vitest unit and parity tests; tests/fixtures/parity holds Python-generated fixtures
tests/e2e/             Playwright tests and the mock MIM server
tools/                 Python dev-time catalogue and logo maintenance (not needed at runtime)
legacy/streamlit-prototype/  Original Streamlit app and tests, kept as a migration reference
docs/                  Architecture, state contract, deployment, rebuild audit and compatibility
```

## Editing the catalogue

Catalogue maintenance is unchanged: edit the declarations in `tools/populate_ceos_ard.py`, run `python tools/populate_ceos_ard.py` to regenerate `data/ceos_ard_products.json`, the research log and reports, then run `npm test` (the catalogue is validated on load: stable unique IDs, field types, ISO dates, http(s) URLs, one research-log row per product and field). Keep product IDs stable. If `data/ceos_ard_products.json` is absent, the app falls back to `demo_products.json` with the `ceos_ard_status.json` overlay, as before. Rebuild and restart the server to publish changes.

## MIM snapshot for curated products

Each curated product is linked to its CEOS MIM records in `data/mim/links.json` (MIM product ID and the missions it covers). `tools/build_mim_snapshot.mjs` fetches the linked products, instruments (with radar parameters), missions and mission images from the public CEOS Database API and writes:

- `data/mim/snapshot.json`: the values the explorer shows, with the database edition, data date, licence and attribution. It is validated when the server starts and by `npm test`; a bad snapshot is skipped with a warning.
- `reports/mim_reconciliation.md`: where MIM and the curated catalogue differ, and MIM CEOS-ARD products not yet in the catalogue.

```bash
NODE_USE_ENV_PROXY=1 node tools/build_mim_snapshot.mjs   # NODE_USE_ENV_PROXY only behind a proxy
npm test
```

Then vendor mission pictures (same-origin only, so the app works offline):

```bash
NODE_USE_ENV_PROXY=1 node tools/fetch_mission_visuals.mjs
```

It copies, into `assets/mission_visuals/`, the silhouette icon of every mission with spacecraft-specific artwork (CEOS MIM original artwork, CC BY 4.0) and the picture only where MIM records a credit (rights holder and licence). Pictures without a recorded credit are left out until their terms are confirmed, and generic illustrations are never used. The product's agency mark flips (hover, keyboard focus or tap; a plain swap with reduced motion) to the newest such mission; mission cards show the picture with its credit, or the silhouette.

Curated values always take precedence. MIM values fill gaps and add mission and instrument detail; they are marked with a purple asterisk and never affect filtering, matching or ordering.

## CEOS-ARD labels

- **CEOS-ARD assessed** — only when `ceos_ard_verified` is `true` in the curated data, or, for MIM records, when the product link reports `product_status=CEOS-ARD` **and** a CEOS-ARD certification has an approval date or review URL.
- **Assessment in progress** — informational, not a completed assessment.
- Other statuses are neutral. Status is never inferred from the provider, instrument or apparent suitability.

## Current limitations

- Public documentation is uneven: tiers, uncertainty, encoding and update cadence are often unreported; missing values are labelled, never treated as zero or as a pass.
- Observation record periods and local availability are not established by this catalogue; provider portals perform those checks.
- MIM provides no product-resolution field; only explicit values (or a metre value in the product name) count as product resolution. Instrument resolution is a labelled display fallback.
- Broad coverage categories (Local → Global) are preserved for compatibility; they describe operating scope, not coverage at a place or time.
- The MIM cache is process-local: it resets on restart and is not shared across replicas.
- Profiles, notes and drafts are session-only (no accounts).
- Purpose guidance version 1 is illustrative and **not reviewed**; it covers wetlands in detail and gives general checks elsewhere. The entry imagery is an AI-generated fictional scene (radar and thermal looks are stylised from it), not satellite data; the repository keeps the native generated files and their provenance in `assets/purpose-imagery/`; rebuild the web versions in `static/images/purpose-journey/` with `python tools/build_purpose_imagery.py` (it uses the upscaled working masters when present, otherwise the native files).
- MIM integration is tested against fixtures and a mock server; it was also checked by hand against the live public CEOS Database API (59 products, edition e574f0c2, data as of 2026-10-23).
