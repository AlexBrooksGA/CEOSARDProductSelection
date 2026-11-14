# Publish checklist: C-QAS section and CEOS MIM database integration

For the work on branch `claude/cqas-product-selection-planning-84nj2u` in both repositories: this one (the Product Explorer) and `CEOSARD-CQAS-Reporting` (the C-QAS reporting demo).

## 1. Before merging

- [ ] Review and merge both branches. In this repository run `npm run verify` (type check, unit tests, build and end-to-end tests). Then run `npm run build:sites && npm run test:hosting`.
- [ ] In the demo repository, run `node tools/sync-report.mjs --check`. CI runs the same check.

## 2. Product Explorer on Sites

- [ ] **Update the runtime secrets first.** MIM now reads the public CEOS Database API with no credentials.
  1. Delete `MIMS_API_USERNAME` and `MIMS_API_PASSWORD` (old demo host).
  2. Delete `MIMS_API_BASE_URL`, or set it to `https://ceos-capabilities.org/api` (or `off`).
  3. Optional: add `MIMS_API_KEY`.

  Never change only the base URL: the old credentials would then go to the new host. See [`SITES_DEPLOYMENT.md`](SITES_DEPLOYMENT.md).
- [ ] Republish through the Sites workflow. Pushing to GitHub does not republish.
- [ ] Spot-check the following on the published site:
  - `/products/landsat-c2-sr`: C-QAS section and badge, MIM panel with pictures, logo flip.
  - `/shortlist?v=1&sl=landsat-c2-sr,sentinel2-level2a&cmp=landsat-c2-sr,sentinel2-level2a&fields=instrument`: C-QAS row, mission rows with asterisks, footnote.
  - **Load MIM products** on Discover loads 59 records and shows the edition.

## 3. Live embed in the reporting demo (decision needed)

The demo's **Product Explorer** tab offers the live explorer page and a saved snapshot of its C-QAS section (from `tools/snapshot-explorer.mjs` in the demo repository). It opens on the snapshot because the explorer's Content Security Policy sends `frame-ancestors 'none'`, which makes browsers block the live embed.

To make the embed work, the explorer must allow the demo's origin. In `svelte.config.js`, change `'frame-ancestors': ['none']` to include `'self'` and `https://alexbrooksga.github.io` (and local preview origins if wanted). This relaxes a security header, so it is the owner's decision; it was not changed in this branch.

- [ ] Decide on, and if agreed make, the `frame-ancestors` change.
- [ ] If Sites adds its own framing headers, check that the embed then works.
- [ ] Once the live embed works, set `EMBED_DEFAULT = 'live'` in the demo's `index.html`; refresh the snapshots whenever the report or the C-QAS section changes.
- [ ] Publish the demo on GitHub Pages (merge to `main`).

## 4. Data to keep current

| What | How | When |
|---|---|---|
| MIM snapshot | `NODE_USE_ENV_PROXY=1 node tools/build_mim_snapshot.mjs` (the variable is needed only behind a proxy), then `npm test` | When `/api/meta` shows a new edition (currently `e574f0c2`, data as of 2026-10-23) |
| Mission pictures | `node tools/fetch_mission_visuals.mjs` after the snapshot | With the snapshot |
| C-QAS example reports | `node tools/build_cqas_examples.mjs`, then `npm test` | When the catalogue gains or loses a product, or a profile changes (currently **example data** for all 26 products) |
| Real C-QAS reports | Write `data/cqas/<product-id>.json` (format `cqas-report/2`) and remove that product's profile from the generator | When the C-QAS test system produces output |

## 5. Follow-ups found during this work

- [ ] **Picture credits:** 8 missions have spacecraft artwork in MIM with no recorded credit: Sentinel-2A/B, Sentinel-1C/D, ALOS-2, RISAT-1A, NovaSAR-1 and EarthDaily. Their silhouettes are shown; the pictures are not. Confirm the terms with the MIM team (support@ceos-capabilities.org), then rerun the image tool.
- [ ] **Reconciliation** (`reports/mim_reconciliation.md`):
  - Radarsat-1 and THEOS-1 SR are CEOS-ARD in MIM but missing from the curated catalogue.
  - Three access links differ: ALOS-2 ScanSAR, and Landsat C2 SR and ST (DOI versus EarthExplorer).
  - MIM lists Sentinel-2C as operational; the curated Sentinel-2 L2A record names only 2A and 2B.
- [ ] **C-QAS:** the report format (`docs/CQAS_REPORT_FORMAT.md`, now `cqas-report/2`) is what the C-QAS system should write. Every view labels anything other than `reviewed` reports.
- [ ] **Reporting demo:** `CEOSARD-CQAS-Reporting` still reads `cqas-report/1`. Update it to v2 (channels, optional radiometric test, series) before refreshing its embedded copy of `landsat-c2-sr.json`, and refresh its explorer snapshots.
- [ ] **Hosting:** the explorer stays on Sites and local runs for now. Moving to a CEOS domain means updating the demo's `EXPLORER_DEFAULT` and the `frame-ancestors` list.
