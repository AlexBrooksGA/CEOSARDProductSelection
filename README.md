# CEOS-ARD Product Explorer

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

A clean setup **without MIM credentials** supports the complete curated-catalogue journey.

## Optional MIM configuration

```bash
cp .env.example .env   # then edit; .env is git-ignored
```

| Variable | Purpose |
|---|---|
| `MIMS_API_USERNAME`, `MIMS_API_PASSWORD` | Server-only credentials (names unchanged from the prototype). |
| `MIMS_API_BASE_URL` | API root, e.g. `https://eo-explorer-demo.diamondsky.au/api`. HTTPS required (http only for localhost). |
| `MIMS_CACHE_TTL_SECONDS` | Cache freshness, default 21600 (6 hours, as before). |
| `MIMS_REFRESH_COOLDOWN_SECONDS` | Minimum gap between upstream refreshes, default 60. |
| `MIMS_FAILURE_BACKOFF_SECONDS` | Pause after a failed load before retrying upstream, default 30. |

Credentials are read only on the server, never sent to the browser, put in URLs or logged. Requests and schema-discovered URLs are restricted to the configured origin and API path. Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#mim-integration).

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

- **Start with your purpose.** A fresh visit opens a short sentence builder — *I want to [monitor change] in [wetlands], to understand [seasonal changes in inundation]* — with optional output, measurement, detail and frequency. A live preview shows the proposed filters and why, what the catalogue can't check, the checks you'll see on each product (with sources) and what stays unchanged. Nothing changes until **Find candidate products**; **Skip to catalogue** (top right) goes straight to browsing. Afterwards **Your purpose** above the results offers Edit, Clear purpose and Undo, and flags *Filters adjusted since setup*. Qualitative answers ("small features", "across each season") never become numeric limits; only values you type do. The guidance is illustrative and not reviewed by CEOS or domain experts (see [`docs/purpose-journey/GUIDANCE.md`](docs/purpose-journey/GUIDANCE.md)).
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
- Purpose guidance version 1 is illustrative and **not reviewed**; it covers wetlands in detail and gives general checks elsewhere. The entry imagery is illustrative, not satellite data.
- Live MIM integration was validated against controlled fixtures and a mock server in this rebuild, not against the live service.
