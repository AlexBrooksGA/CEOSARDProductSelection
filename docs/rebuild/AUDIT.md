# Current-system audit — CEOS-ARD Product Explorer (Streamlit prototype)

Audit date: 9 October 2026. Completed before any application code was changed.
Scope: repository at commit `6153981` plus the untracked design brief and rebuild prompt.

**Evidence labels.** **Run** = observed at runtime (Streamlit 1.59.1 server driven with Playwright, or
`streamlit.testing` AppTest). **Test** = asserted by an existing test. **Code** = inferred from source only.
Access limitation: live MIM was not called (credentials are deliberately not read); MIM behaviour is
from code and the existing mocked tests.

## 1. Entry points, data flow and maintenance

| Item | Source | Notes |
|---|---|---|
| Streamlit entry | `app.py` (`product_selection_framework.py` re-exports it) | One script; three tabs Discover / Profile Builder / Compare; all state in `st.session_state`. |
| Windows launcher | `run_app.bat` | Creates `.venv`, installs `requirements.txt` when it changes, runs Streamlit. |
| Theme config | `.streamlit/config.toml` | Light theme, `runOnSave=true`, `headless=false` (dev-oriented). |
| Catalogue load | `catalogue.py` | Prefers `data/ceos_ard_products.json`; **only if absent** falls back to `demo_products.json` + `ceos_ard_status.json` overlay (overlay keyed by demo IDs). Raises on duplicate IDs; skips non-dict/ID-less rows silently; invalid record → `CatalogueError`. |
| Profiles | `data/default_profiles.json` → `Profile.from_dict` | Three built-ins: Explore / Map Land and Features / Monitor Change Over Time. |
| Matching | `matching.py` | Pure; see §2. |
| MIM adapter | `mims_api.py` | Product + instrument join (active) and an unused legacy mission adapter. |
| FedEO | `fedeo_*.py`, `components.py` import, `.env.example` flag, README section, `tests/test_*fedeo*` | To be removed. |
| Presentation | `components.py` | Cards, badges, comparison, education text, vendored agency logos. |
| Catalogue maintenance | `tools/populate_ceos_ard.py` | Deterministic rebuild of `data/ceos_ard_products.json`, `data/ceos_ard_research_log.csv` and three reports from declarations + `reports/ceos_ard_changes_2026-09-14.csv`. **Run:** regenerated output is byte-identical to the committed files except CRLF line endings. |
| Logo maintenance | `tools/fetch_agency_logos.py` → `assets/agency_logos/` + `manifest.json` | Manual, networked, dev-time only. |
| Untracked review artefacts | `tmp/` (git-ignored) | Source captures and scripts proposing further catalogue corrections (e.g. Landsat `uint16`) that were **not** applied to the JSON. Out of scope; not to be applied by the rebuild. |
| CI | `.github/workflows/ci.yml` | Python 3.11/3.12, compileall, unittest. Unpinned `requirements.txt`. |

## 2. Test baseline

| Run | Result |
|---|---|
| `python -m unittest discover -s tests` with Streamlit **1.59.1** (the version in the local `.venv`) | **85 tests, OK** (Run). |
| Same with Streamlit **1.65.0** (latest allowed by `streamlit>=1.41,<2`) | **19 errors** — `AppTest.from_file("app.py")` now resolves relative to the test file. Baseline CI fragility, not caused by the rebuild. |

Behaviour the tests protect (and where it goes):

- `test_matching`: required pass/fail, preferred-driven strong group, case-insensitive name tie-break, required unknown → manual check, optional unknown sorts last, comparison cap does not displace → ported to `tests/unit/matching.test.ts` + Python-generated parity fixtures.
- `test_profiles`: built-in values; Explore initial filters; profile defaults re-applied only on deliberate selection; editing survives unrelated reruns; custom create/apply/rename/update/delete; existing session-profile format; four-tile carousel → values/semantics ported; Streamlit widget/carousel assertions become browser tests or documented intentional changes.
- `test_catalogue`, `test_catalogue_errors`: 26 unique verified records; every product × researched field has a log row; ISO dates, http(s) URLs; invalid product/profile → error → ported.
- `test_mims_api`: product-name metre resolution is product-level; instrument resolution display-only; certification evidence; one bulk instrument request; base URL join → ported. Mission-mapping test is for the unused legacy path (retired with it, see §5).
- `test_app_mim`: 30 loaded MIM records → 24 tiles rendered (display limit), fallback note, MIM record can be compared → display-limit and compare behaviour carried into browser tests.
- `test_terminology`: profile names/descriptions; group constant strings; assessment-boundary disclaimer; "Nominal revisit" wording → ported.
- `test_agency_logos`: every curated agency has a local mark; API records show none → ported.
- `test_fedeo_*`, `test_app_fedeo`: FedEO-specific → retired. General failure isolation is re-covered for MIM.

## 3. Runtime walk-through (observed)

- Fresh session (Run): Explore preset auto-applied; spatial ≤30 m **Preferred**; 26 visible = 21 "Closer profile matches" + 5 "Other products meeting required profile criteria" (the 5 lack a single product resolution).
- Monitor Change preset (Run): family → Surface Reflectance, revisit ≤5 d Required: 2 matches (EarthDaily, Sentinel-2 L2A); manual-check group hidden until a checkbox is ticked, then 7 records (Landsat C2 SR is among them because 16 d > 5 d).
- Unticking **Keep records with unreported values** (Run): **0 products** — every curated record has `launch_or_start_year = null`, and that clause hides unknown launch years regardless of criteria.
- MIM without credentials (Run): caption "credentials are not configured"; Load → warning, status "MIM API unavailable"; bundled catalogue unaffected.
- Comparison (Run): fourth add → "You can compare up to three products…", existing three unchanged.
- Not run: live MIM, mobile/zoom, screen reader.

## 4. Feature / behaviour inventory

Columns: **Prompt** = covered (C) / omitted (O) by the rebuild prompt; **Destination**; **Verification**.

| # | Behaviour today | Source | Prompt | Destination | Verification |
|---|---|---|---|---|---|
| 1 | Required / Preferred / Not used modes; `≤` for resolution & revisit, `≥` (integer-truncated) for bit depth; coverage ordinal scale, unknown target passes | matching.py | C | `domain/matching.ts` | Parity fixtures + unit tests at boundaries |
| 2 | Missing value or `"Unknown"` → `unknown`, never pass/zero | matching.py | C | same | Unit + parity |
| 3 | Group: required outside/unknown → Manual task check; else eligible; strong = eligible with max preferred met **and** 0 unknowns | matching.py | C | same (unchanged constants) | Parity |
| 4 | Sort: −preferred met, unknown count, case-folded name (code-point order) | matching.py | C | same | Parity incl. tie cases |
| 5 | Descriptive summary sentences (met / outside / "Manual task check — not reported") | matching.py | C | same; displayed under new wording layer | Parity on exact strings |
| 6 | Criteria iteration order = profile dict order; unknown criterion names evaluate unknown | matching.py | O | preserved | Parity |
| 7 | Comparison add unique, cap 3, never displaces | matching.py | C | `domain/selection.ts` | Unit + e2e |
| 8 | Metadata filter: family, assessment scope (4 options), search over product + mission name (case-folded), provider, sensor substring, operational status, record source, launch year, hide-unknown | app.py `metadata_filter` | C (launch year removed) | `domain/filters.ts` (legacy launch-year evaluator kept for parity only) | Parity fixtures over filter matrix |
| 9 | Hide-unknown includes `launch_or_start_year is None` → hides all curated records | app.py | O | Legacy evaluator keeps it; new UI drops that clause with the launch-year control | Parity (legacy) + unit (new) — **intentional change** |
| 10 | Source precedence: researched JSON over demo; status overlay only on fallback; duplicates rejected; dedupe by stable ID (first wins, local before MIM) | catalogue.py, app.py | C | `domain/catalogue.ts` + `server/catalogue.ts` | Unit tests incl. fallback fixture |
| 11 | `Product.from_dict` defaults: name from product/display/official name; mission name from missions; revisit from nominal_*; PFS from type+version; level from tier; record/source URL from information URL; unknown keys ignored | models.py | O | `domain/catalogue.ts normaliseProduct` | Parity: Python-normalised catalogue vs TS |
| 12 | Product vs instrument resolution; instrument value display-only with fallback label | mims_api.py, components.py | C | server normaliser + `ProductFacts` component | Unit + e2e |
| 13 | Radiometric bit depth vs output storage display precedence | components.py | C | `domain/format.ts` | Unit |
| 14 | Card temporal fact shows **update frequency instead of revisit** when present | components.py | O | **Changed**: separate labelled temporal facts | Unit — intentional (temporal separation) |
| 15 | Badges: assessed only when `ceos_ard_verified`; in-progress amber; neutral otherwise; PFS version; self/peer-review badges | components.py | C | `AssessmentBadge` | Unit + e2e |
| 16 | MIM assessed only if link `product_status=CEOS-ARD` **and** a CEOS-ARD certification has approval date or review URL | mims_api.py | C | `server/mim/normalise.ts` | Parity fixtures from Python normaliser |
| 17 | MIM schema discovery: `/docs/` → regex schema URL → `paths`; product/instrument path scoring; servers[0] root; requires a mission endpoint to exist (coupling) | mims_api.py | C | `server/mim/schema.ts` (mission requirement preserved, see §5) | Unit with schema fixtures |
| 18 | MIM HTTP: basic auth, 2 retries w/ backoff on 429/502/503/504, (5 s, 25 s) timeouts, safe error messages | mims_api.py | C | `server/mim/http.ts` + overall deadline | Unit with fake fetch |
| 19 | MIM product resolution from explicit field or metre value in name (`2.5m`) | mims_api.py | C | normaliser | Parity |
| 20 | MIM 6 h cache; Load only on button; Refresh clears cache **and** unloads | app.py | C | `server/mim/cache.ts`; Refresh now re-fetches (intentional) | Unit with fake clock |
| 21 | MIM load auto-relaxes filters (scope→All, show unknown, show manual) | app.py `reveal_loaded_mim_candidates` | C | **Removed** (explain + explicit broaden action) | e2e |
| 22 | MIM tile render limit 12/24/48/96/All (default 24), matching unaffected | app.py | O | Preserved as "Show more" paging of MIM records only | e2e |
| 23 | MIM records show no agency logo; curated records show vendored logo with fallback initials | components.py | O (logo test named) | `AgencyMark` + build-time asset glob | Unit + e2e |
| 24 | Profiles: apply sets criteria toggles/values, family, scope, show-unknown; other refinements retained; re-apply resets; carousel | app.py | C | Preview/apply/undo; retained constraints listed | Unit + e2e |
| 25 | Enabling a criterion in Discover reuses profile mode else Preferred | app.py `build_active_profile` | C | **Changed**: inline mode editor | e2e |
| 26 | "Modified" detection ignores coverage changes | app.py `filters_changed` | O | Fixed: fingerprint of all criteria (bug fix) | Unit |
| 27 | Custom profiles: name ≥3 chars after whitespace collapse, unique case-insensitively across built-ins, id `custom-<hex>`; builder snapshot of current filters; delete resets to first built-in if active; bit-depth criterion preserved on edit | app.py | C | `domain/profiles.ts`, `state/session.ts` | Unit + e2e CRUD |
| 28 | Precise numeric entry with slider presets; ranges 0.1–100 000 m, 0.1–365 d, 1–32 bit | app.py | C | `CriterionEditor` | Unit (URL validation) + e2e |
| 29 | "Clear filters" resets refinements **and re-applies profile defaults** | app.py `reset_refinements` | C | Split into **Clear criteria** and **Restore profile defaults** | e2e |
| 30 | Cards per row 2/3/4; group by `family` (labelled "PFS or product type" but groups by mission family) | app.py | O | Dropped (responsive grid); grouping not carried (mislabelled) — **intentional** | Documented |
| 31 | Comparison rows (21 fields), difference highlight, criterion indicators ✓ △ ? •, source-record link | components.py | C | Grouped aligned comparison + field chooser | e2e |
| 32 | Comparison silently drops IDs whose record is not loaded | app.py | O | Placeholder rows (fix) | e2e |
| 33 | Technical details expander, unreported-field list, links with "Unavailable links" list | components.py | C | Product details page | e2e |
| 34 | Education text (resolution ≠ accuracy; revisit ≠ delivery; bit depth ≠ quality…) | components.py | C | Glossary + inline "Explain this term" | e2e text checks |
| 35 | Disclaimer: assessment does not certify application suitability | components.py | C | Header/footer copy | e2e |
| 36 | Research log: exactly one row per product × 48 fields, `date_checked` 2026-07-12 / 2026-09-14 | data CSV | C | `server/provenance.ts` join by (id, field) | Unit (integrity port) |
| 37 | Spatial resolution options (band/mode variants) stored but not displayed | data | C | Shown in details | e2e |
| 38 | Demo/status fallback datasets | data | C | Supported by loader | Unit |
| 39 | Population/logo scripts | tools/ | O | Kept as Python **dev-time** tools; documented | Doc |
| 40 | MIM `mission_name` placeholder text "Not reported by MIM product endpoint" is searchable data | mims_api.py | O | Bug fix: null value + display text (recorded) | Unit |

## 5. What the prompt missed or got wrong

1. **Hide-unknown/launch-year coupling** (#9): the prototype's "keep unreported values" toggle hides every curated product. Removing the launch-year control requires dropping that clause; recorded as an intentional change, legacy evaluator retained.
2. **MIM product discovery depends on a mission endpoint** (`inspect_product_api` → `inspect_openapi`). Preserved for parity (a schema without missions is treated as a schema change); flagged for owner decision.
3. **Schema-discovered URLs are not origin-restricted** today: the docs regex and `servers[0].url` could direct authenticated requests elsewhere. Fixed (security), recorded separately.
4. **No overall MIM deadline**: retries × 4 requests × 25 s could exceed minutes. Bounded with an overall deadline (intentional).
5. **Refresh semantics**: today Refresh clears and unloads; the prompt's "Refresh MIM data" is implemented as a cooldown-limited re-fetch that keeps the last good data on failure.
6. **MIM tile display limit**, **agency logos**, **cards-per-row**, **group-by-family** (mislabelled), **profile carousel**, **Windows launcher**, **population tooling**, **unpinned CI dependency** were not mentioned. Dispositions in §4.
7. **"Modified" ignores coverage** and **comparison silently drops unloaded IDs** — bug fixes, recorded.
8. **Search scope** is product + mission name only; the brief's wireframe says "or provider". Preserved; label says what is searched.
9. **`Product.family` is a mission prefix** (e.g. Landsat C2 SR → "Landsat 4"), distinct from `product_family`. Not used for grouping in the rebuild.
10. **Python `casefold`/code-point ordering**: JS needs explicit equivalents for parity; a documented approximation (ß/ẞ/ſ/ς/ligatures) covers the catalogue and fixtures.
11. **MIM assessment "level"** is the joined link status string (e.g. "CEOS-ARD"), not a Threshold/Goal level. Preserved but labelled "MIM product status".
12. The design brief proposes alphabetical ordering and FedEO retention; the prompt correctly overrides both.
13. `docs/WEB_HOSTING_AWS_UPLIFT_REVIEW.md` is Streamlit-specific; kept as historical with the deployment notes superseded by `docs/DEPLOYMENT.md`.

No blocking conflict remains.

## 6. Stack decision

**SvelteKit 2.70.3 + Svelte 5 + TypeScript, adapter-node 5.5.7, Vite 8, Vitest, Playwright, axe-core.**

| Criterion | SvelteKit 2 | React Router 7 (framework mode) — strongest alternative |
|---|---|---|
| Server-only boundary | `$lib/server` and `$env/*/private` imports are build errors in client code | `.server.ts` convention, also enforced |
| Browser state | Fine-grained runes; little boilerplate for URL-derived state | Hooks + memoisation; more re-render management |
| Runtime size | Small compiled output | React runtime ~45 kB gz |
| Testing | Vitest (same Vite pipeline) + Playwright | Same tools |
| Deployment | `node build`, devDependencies bundled → zero runtime npm deps | `react-router-serve` + runtime deps |

SvelteKit **3.0** was released on 1 October 2026 (8 days ago, with breaking changes: config moved to
`vite.config`, `ORIGIN` env var removed, `$app/stores` removed). The latest 2.x is pinned for stability;
the code uses forward-compatible APIs (`$app/state`, no `$app/stores`) and the upgrade path is
`npx sv migrate sveltekit-3`.

## 7. Migration and verification plan (ordered)

1. Move the Python prototype to `legacy/streamlit-prototype/` (reference only), strip FedEO from it, re-run its tests.
2. Generate parity fixtures with the legacy Python (`legacy/.../generate_parity_fixtures.py`).
3. Scaffold SvelteKit with pinned versions; port domain (types, normalisation, matching, filters, selection, profiles) → unit + parity tests.
4. Server: catalogue/profile/provenance loading with validation; MIM client/schema/normaliser/cache/endpoints → fixture tests (missing config, auth, timeout, schema change, cache, coalescing, refresh cooldown, origin restriction).
5. Client state: URL contract v1, session adapter, private notes/profiles/disclosure → unit tests.
6. UI: Discover, details, Shortlist & compare, My profiles, glossary, theming → Playwright e2e against `node build` (no-MIM and mock-MIM servers) + axe in both themes + screenshots at narrow width/zoom.
7. Remove FedEO from active code/config/docs; update README, CI, `.env.example`, deployment docs, Windows launcher.
8. Reconcile this inventory (§4) in `docs/rebuild/COMPATIBILITY.md` with results.
