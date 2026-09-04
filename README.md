# CEOS-ARD Product Explorer

A Streamlit proof of concept for discovering, shortlisting and comparing Earth observation data product records. It supports transparent application-screening criteria, session-only custom profiles, a bundled catalogue, and optional CEOS Missions, Instruments and Measurements (MIM) records.

This prototype supports dataset discovery and comparison. CEOS-ARD assessment describes product preparation, metadata and measurement-specific requirements against a Product Family Specification (PFS); it does not certify application suitability. Built-in task profiles are illustrative application-screening starting points, not official CEOS application requirements.

## Project structure

- `app.py` — three-tab Streamlit workflow and session state
- `product_selection_framework.py` — legacy Streamlit entry point forwarding to `app.py`
- `components.py` — cards, badges, comparison view, and educational content
- `models.py` — typed product and profile models
- `catalogue.py` — local JSON loading, validation, status overlay, and deduplication
- `matching.py` — required/preferred/unknown evaluation and deterministic grouping
- `mims_api.py` — authenticated, cached-at-call-site, schema-driven MIM adapter
- `fedeo_api.py` — optional, failure-isolated FedEO collection client
- `fedeo_normalisation.py` — provider-tolerant FedEO field mapping with raw-response retention
- `fedeo_matching.py` — conservative collection matching and display-only sidecar orchestration
- `fedeo_discovery.py` — bounded collection discovery and conservative known-product overlap screening
- `fedeo_ui.py` — optional FedEO enrichment and separate discovery expanders
- `data/ceos_ard_products.json` — 26 researched, normalised CEOS-ARD assessed data product records loaded offline
- `data/ceos_ard_research_log.csv` — field-level provenance, confidence, and failed-look-up records
- `data/demo_products.json` — original prototype values retained as matching history/fallback input
- `data/ceos_ard_status.json` — explicit, editable CEOS-ARD status mapping
- `data/default_profiles.json` — illustrative built-in profiles
- `tests/test_matching.py` — lightweight core-logic tests
- `run_app.bat` — Windows launcher

Python 3.11 or newer is required.

## Run on Windows

Double-click `run_app.bat`, or run it from Command Prompt. It creates `.venv` when needed, installs requirements when `requirements.txt` changes, and runs `streamlit run app.py`. Streamlit is allowed to open the browser automatically.

Manual setup:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
streamlit run app.py
```

Run the tests with:

```powershell
python -m unittest discover -s tests -v
```

The same test and compile checks run automatically for pushes and pull requests
through GitHub Actions in `.github/workflows/ci.yml`.

## Optional MIM API configuration

Create the local configuration file, then replace the placeholders with the credentials supplied by the MIM service administrator:

```powershell
Copy-Item .env.example .env
notepad .env
```

Keep `MIMS_API_BASE_URL=https://eo-explorer-demo.diamondsky.au/api`; use the API root, not the Swagger URL ending in `/docs#/`. `.env` is ignored by Git. Credentials are read only from the environment, are not displayed, and are not included in error messages.

The authenticated OpenAPI schema was validated against CEOS Database API v0.1.0. The current adapter uses:

1. `GET /docs/` to discover the declared schema URL.
2. `GET /openapi.json` to validate paths and parameters.
3. `GET /products` to load the API's product, certification, access-link, and stable instrument-link records.
4. `GET /instruments` once to load the bulk instrument catalogue, including `spatial_resolution_best`.

The product and instrument collections are joined locally using the API's stable `instrument_id`; names are not used for fuzzy matching. The live API returned 56 products during validation. The legacy mission adapter remains available in `mims_api.py` but is no longer used by the Streamlit interface.

The joined product and bulk-instrument response is cached with `st.cache_data` for six hours. Loading occurs only after the checkbox is enabled and **Load MIM product records** is pressed. **Refresh MIM data** clears only that cache. Most filtering is then local. The browser initially renders 24 MIM tiles, with a control to increase or remove that display limit; the loaded data and matching results are not truncated. If credentials, authentication, timeouts, schema structure, or the service fail, the bundled catalogue continues to work.

Data-product spatial resolution remains separate from instrument resolution. An explicit metre value in an API product name, such as `25m` or `2.5m`, is treated as reported product resolution and may influence matching. When product resolution is absent, the card displays the linked instrument's `spatial_resolution_best` as a clearly labelled **display fallback**. That fallback is not assigned to `spatial_resolution_m` and does not influence product matching. Instrument values can differ from delivered-product resolution, processing grid size, or mode-specific resolution.

## Optional FedEO collection metadata

FedEO (Federated Earth Observation missions access) collection metadata is an experimental, display-only sidecar. The sidebar control **Enable FedEO collection metadata (experimental)** is off by default. When it is off, no FedEO lookup function is called, no FedEO section is rendered, and the existing catalogue, MIM, filtering, matching, and comparison paths are unchanged.

`ENABLE_FEDEO_INTEGRATION=true` permits the sidebar control to appear; set it to `false` to remove the control and disable the code path. Enabling it performs two separate optional operations:

1. **Metadata enrichment** searches a bounded set of currently filtered products, caches each successful product lookup independently for six hours, and renders a collapsed **FedEO collection metadata** section only for an exact or unique high-confidence metadata match. Possible matches remain diagnostics and are never attached to products.
2. **Additional collection discovery** is controlled by the nested **Show additional FedEO collections** checkbox, which is on when enrichment is first enabled but can be turned off independently. It makes one cached, one-page search for the selected family (at most 20 returned collections), screens the response against all 26 local products plus every session-loaded MIM product, and shows at most eight candidates in a separate collapsed section.

Discovery candidates are not converted into `Product`, added to existing filters, assigned a CEOS-ARD status, or presented as globally new. They are FedEO collections for which no reliable overlap with the currently known product metadata was identified. Exact, high-confidence, and possible overlaps are withheld conservatively; materially different variants such as static layers or mosaics may remain separate candidates.

FedEO values do not modify `Product` records. Curated CEOS-ARD assessment, PFS, approval, review, note, and accuracy fields are protected explicitly. FedEO ground sample distance is not used as product resolution, and raster `uint16` is labelled only as **16-bit output storage**, never as sensor quantisation or radiometric bit depth. A timeout, service error, malformed response, or unavailable FedEO service leaves the existing application usable.

See [`reports/fedeo_integration.md`](reports/fedeo_integration.md) for architecture, field mapping, matching rules, provenance, live validation, limitations, and rollback instructions.

## CEOS-ARD badges

- **CEOS-ARD assessed** — green treatment only when `ceos_ard_verified` is explicitly `true` in `data/ceos_ard_status.json`.
- **Assessment in progress** — amber informational treatment; not a completed assessment.
- **Not assessed / Status unknown** — neutral treatment.
- **Curated CEOS-ARD record** — a provenance label, not an application-suitability claim.

MIM products are displayed as CEOS-ARD assessed only when their API product link reports `product_status=CEOS-ARD` and the associated certification contains an approval date or review URL. Status is not inferred from provider, instrument, or apparent technical suitability.

## Editing the catalogue

Edit the compact source declarations in `tools/populate_ceos_ard.py`, then rebuild `data/ceos_ard_products.json`, the provenance log, and reports with that script. The application prefers the researched catalogue and falls back to the original demo/status files only if it is absent. Keep product IDs stable. Custom profiles are intentionally held only in `st.session_state` and are never written to disk.

## Current limitations

- Public documentation remains uneven: overall tier, scalar uncertainty, output encoding, and product-specific update cadence are frequently not reported. Missing values remain null and display as `Not reported`.
- Instrument characteristics are labelled through basis fields and are not silently presented as product characteristics or used for matching.
- The MIM product endpoint does not provide a dedicated product-resolution field; only explicit values in product names are currently recognised as product-level resolution.
- Product-family keyword mapping is approximate where the API lacks a direct category.
- MIM joins are by stable IDs only; uncertain fuzzy matches are not silently merged.
- FedEO provider coverage and collection schemas are uneven. An enabled lookup may legitimately produce no match or a diagnostic-only possible match.
- FedEO discovery is a bounded contextual search, not a complete catalogue synchronisation. A displayed candidate is not proof that the collection is globally new or absent under another identifier.
- FedEO item/granule records are not queried; item-only technical values are not generalised to a collection.
- Nominal revisit describes an expected observation opportunity; it does not guarantee usable observations, update frequency, delivery time or latency.
- No application-suitability certification, numerical quality or suitability score, data processing, downloads, or persistent accounts are provided.
- Geometric and radiometric uncertainty controls are read-only future capability; uncertainty filtering is future work.
