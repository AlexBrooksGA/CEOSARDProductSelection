# Architecture

One SvelteKit codebase, built into one Node.js process with `@sveltejs/adapter-node`. Server endpoints run in the same app. There is no separate backend, database or external cache, and no Python at runtime.

```
Browser                                          Node process (node build)
┌─────────────────────────────────────┐          ┌──────────────────────────────────────────────┐
│ routes: /  /products/[id]  /shortlist│  SSR +   │ +layout.server.ts → bundled data (validated) │
│ state/app.svelte.ts (per tab)       │◄────────►│ /api/mim/status|load|refresh → MimService    │
│   URL (public) ⇄ url.ts             │  JSON    │ /api/provenance → research-log rows          │
│   sessionStorage ⇄ session.ts       │          │ lib/server/mim: http, schema, normalise,     │
│ domain/* (pure): filter, match,     │          │   cache (process-local, 6 h)                 │
│   present, compare, summarise       │          └──────────────┬───────────────────────────────┘
└─────────────────────────────────────┘                         │ Basic auth, trusted origin only
                                                                ▼
                                                        CEOS MIM API (optional)
```

## Boundaries

| Layer | Location | Rules |
|---|---|---|
| Domain | `src/lib/domain` | Pure TypeScript. No UI, network or browser storage. It holds the typed `Product`/`Profile` models (same field names as the JSON), catalogue normalisation and validation, the matcher, metadata filters, the presentation layer, comparison rows, profile application, selection rules and the copy summary. |
| Server | `src/lib/server` | SvelteKit forbids importing these modules into client code. Bundled data is loaded through `import.meta.glob`, so the build is self-contained. The MIM client, configuration and cache live here. |
| Client state | `src/lib/state` | The URL contract, the session adapter and the per-tab `AppStore`, which is created in the root layout and shared through context. |
| UI | `src/lib/components`, `src/routes` | Components use domain results from the store. They never implement matching rules. |

## Matching and presentation

`domain/matching.ts` is a line-for-line port of `matching.py`. It keeps the same:

- Required/Preferred/Not-used semantics and boundaries (`≤` for resolution and revisit; `≥` with integer truncation for bit depth; the ordinal coverage scale, where an unknown target passes)
- unknown handling
- `preferred_met` and `unknown_count`
- group assignment (`Closer profile matches` / `Other products meeting required profile criteria` / `Manual task check`)
- ordering: −preferred met, then unknowns, then case-folded name in code-point order

Python's `casefold` and code-point string ordering are reproduced explicitly.

`domain/presentation.ts` is a separate view over those groups. It never re-scores or reorders:

- **No active criteria** → one *Browse products* list.
- **Preferences only** → one list with an explicit note that the order is not a ranking.
- **Required criteria** → *Meet your required criteria* (strong, then eligible, in core order), *Reported outside a requirement* and *Need evidence for a requirement*. The last two are partitions of the manual-check group in its original relative order. A product with both a mismatch and missing evidence appears once, under *outside*, and shows both reasons.

The prototype's launch-year filter is retained only as `legacyLaunchYear` in `domain/filters.ts`, for parity tests. The interface never applies it.

## Data loading

`src/lib/server/catalogue.ts` loads, at build time:

- `data/*.json` and `data/ceos_ard_research_log.csv`
- the agency-logo manifest and images

At server start it then:

- applies the prototype's precedence: the researched catalogue wins, and demo data plus the status overlay is used only as a fallback
- validates structure, stable unique IDs and field types
- joins research-log rows by exact `(product_id, field_name)` only; ambiguous duplicates are not joined
- reports skipped records as warnings

An unusable catalogue produces a clear 500 page naming the problem.

Field-level provenance reaches the browser in two parts. A compact *not-found* index ships with the page, so missing values read "Not found in the sources checked (catalogue checked …)" consistently on cards, details and comparison. Full rows load on demand from `/api/provenance`. Catalogue checking dates are labelled as checking dates, not observation dates.

## MIM integration

`src/lib/server/mim` ports `mims_api.py` and follows the current product/instrument adapter:

1. `GET <base>/docs/` → Swagger UI HTML → declared schema URL (`url:` / `spec-url=`), which must be on the configured origin.
2. `GET` schema → must contain `paths` and an identifiable missions endpoint. The mission requirement is a preserved prototype coupling (see the audit, §5). Products and instruments collections are found with the prototype's scoring rules.
3. `servers[0].url` (if present) defines the root. The product and instrument URLs must be on the configured origin **and** under the configured base path.
4. One `GET` each for products and instruments, joined by stable `instrument_id` only.

Product resolution comes only from explicit product fields or a metre value in the product name. Instrument resolution is a display-only fallback.

**Assessed** requires `product_status = CEOS-ARD` **and** a CEOS-ARD certification with an approval date or review URL.

The browser receives only normalised `Product` objects: no raw payloads, headers or credentials. The prototype's searchable mission placeholder is now a missing value (a recorded bug fix).

### Request safety

- **Credentials:** Basic auth credentials are sent only to the trusted origin.
- **Redirects:** followed manually, and only within that origin.
- **Timeouts:** each request times out after 25 s, and a whole load has a 60 s deadline.
- **Retries:** up to two, for 429/502/503/504 and connection errors. This matches the prototype's urllib3 policy, with a short `Retry-After` honoured.
- **Size limits:** responses are capped at 20 MB and loads at 5,000 products.

### Cache (`service.ts`)

- **Scope and lifetime:** one process-local entry, fresh for 6 hours by default. It resets on restart and is not shared across replicas.
- **Coalescing:** concurrent load and refresh calls share a single upstream request.
- **Failures:** a failure is never cached as an empty success. The last good data stays available, marked *stale*, with a sanitised error.
- **Rate limiting:** *Refresh MIM data* re-fetches at most once per cooldown (60 s by default). After a failure, further upstream attempts wait for the back-off (30 s by default).
- **Session restore:** after a reload, the endpoint is called with `cachedOnly` and never contacts upstream.
- **Endpoints:** load and refresh are `POST` with a JSON body, so link prefetching or crawlers cannot trigger upstream calls.

Every failure mode leaves the curated catalogue fully usable: missing configuration, authentication errors, timeouts, malformed or changed schemas, untrusted URLs and oversized responses. The message explains the state without internal details. Loading MIM never changes filters, scope or selections. If the current scope hides loaded records, a notice explains this and offers an explicit **Show all available statuses** action.

## Purpose-led entry

A fresh visit to `/` opens a purpose entry ("Find Earth observation data for your purpose.") instead of the catalogue; the rule for when it appears is in [`STATE_CONTRACT.md`](STATE_CONTRACT.md#rules).

| Part | Location | Role |
|---|---|---|
| Guidance data | `data/purpose_guidance.json` | Versioned, illustrative, **not reviewed**. Options, sources, general and wetland checks. Validated on load (`loadGuidance`): ids, sources, next actions and families; an invalid file fails the build's unit tests. See [`purpose-journey/GUIDANCE.md`](purpose-journey/GUIDANCE.md). |
| Domain | `domain/purpose.ts` | Pure: sentence wording, public key, visual state, check resolution, and `proposePurpose` (mapping version 1) returning proposed settings, changes against current filters, retained constraints and the next `ExplorerState`. |
| State | `state/app.svelte.ts` | `draft` is separate from `ExplorerState`, so previewing never filters. `applyPurpose` applies once (push history, Undo); later manual edits are never overwritten. `purposeContext` reconciles the URL key with the session (`ok`, `unknown`, `version-mismatch`). |
| UI | `components/purpose/*` | `PurposeJourney` (sentence builder and live preview), `PurposeBackdrop` (decorative imagery, `aria-hidden`), `PurposeSummary` (above results; Edit, Clear, Undo, adjusted indicator), `PurposeChecks` (details and shortlist). The comparison and the copied summary take an optional purpose argument. |

Journey-managed settings are the measurement family, `spatial_resolution_m` and `revisit_days`. Every other part of the public state (search, scope, providers, shortlist, comparison, built-in profile values) is retained and listed in the preview.

**Imagery.** Six 600 × 330 WebP panels in `static/images/purpose-journey/` (`{optical,radar,thermal}-{fine,coarse}`), cropped with identical framing from the supplied concept board, about 20–50 KB each. The neutral state uses a CSS duotone of the optical panel. Changes crossfade (320 ms; none with `prefers-reduced-motion`). A failed image is removed and the gradient remains. The *Illustrative imagery* button explains that the pictures are not satellite data or evidence.

## Security headers

- `hooks.server.ts` sets `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`.
- `svelte.config.js` sets a nonce-based Content Security Policy with `default-src 'self'`, `connect-src 'self'` and `frame-ancestors 'none'`. Fonts are bundled, so no third-party request is made.
- External links use `rel="noopener noreferrer"`.

## Testing

| Suite | Scope |
|---|---|
| `tests/unit/parity-*.test.ts` | Compare the TypeScript port with fixtures generated by the original Python (`legacy/streamlit-prototype/generate_parity_fixtures.py`). Covers catalogue normalisation and fallback, every matching profile case, criterion boundaries, metadata filters (including the launch-year clause), the active-profile build, name validation, `filters_changed` and MIM normalisation and schema selection. |
| `tests/unit/mim.test.ts` | Missing configuration, authentication, timeout, schema and response errors, cache expiry with stale data, coalescing, refresh cooldown, retries, origin and redirect restrictions, and size caps. Uses a fake upstream. |
| `tests/unit/state.test.ts`, `domain.test.ts` | URL round-trip and validation, session storage recovery, presentation partitioning, profiles, selection, facts, the comparison example and the summary. |
| `tests/unit/purpose.test.ts` | Guidance validation, wording and keys, mapping version 1 (no invented thresholds; typed values only), retained constraints, adjustment detection, the unchanged *Monitor Change Over Time* profile, URL privacy, meaningful state, session validation, comparison and summary purpose content. |
| `tests/e2e/*.spec.ts` | Playwright against `node build`: the purpose entry (`purpose.spec.ts`: entry and skip, link bypass, apply once, edit/re-apply/undo, shared-link privacy, details/comparison/summary, custom and not-sure routes, version mismatch, image failure, reduced motion, storage failure, axe in both themes, 390 px), journeys, profiles, URL and history behaviour, storage failure, MIM behaviour against a mock API, and axe checks in both themes. Also covers keyboard use, narrow screens, 200% zoom and request isolation (no third-party or FedEO requests). |
