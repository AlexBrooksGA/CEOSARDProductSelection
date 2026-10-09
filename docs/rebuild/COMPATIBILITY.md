# Compatibility matrix and inventory reconciliation

Reconciles every item in the [audit inventory](AUDIT.md#4-feature--behaviour-inventory) with the rebuilt application. Status values:

- **Preserved** — same behaviour.
- **Changed** — an intentional change that the rebuild prompt requires or permits.
- **Fixed** — a recorded bug fix, kept separate from parity work.
- **Dropped** — removed, with the reason given.
- **Open** — left unresolved for the owner.

## Preserved behaviour (parity verified)

| # | Behaviour | Verification |
|---|---|---|
| 1–6 | Required/Preferred/Not-used semantics and boundaries. Unknown handling, `preferred_met`, `unknown_count`, groups, deterministic order (−preferred, unknowns, case-folded name), summary wording and criterion order. | `parity-matching.test.ts`: 10 profile variants × 39 products, plus 234 criterion boundary cases, all identical to Python. |
| 7 | Comparison is unique, capped at 3 and never displaces. | Parity cases, `domain.test.ts` selection test, e2e "Comparison is full". |
| 8 | Metadata filter semantics when a filter is explicitly active. | `parity-app.test.ts`: 18 filter scenarios identical, including the legacy launch-year clauses. |
| 10–11 | Source precedence, demo + status fallback, duplicate rejection, stable-ID dedupe, `Product.from_dict` derivations. | `parity-catalogue.test.ts`: researched and fallback catalogues identical; `from_dict` edge cases. |
| 12, 16, 17, 19 | MIM product and instrument join by stable ID; product resolution from explicit fields or the name only; instrument value display-only; two-part CEOS-ARD evidence rule; schema discovery and scoring; `servers[0]` root. | `mim.test.ts` parity: 13 products, 13 family cases, 12 resolution cases, 5 schemas, docs regex and server roots. |
| 13 | Radiometric bit depth versus output storage. | `domain.test.ts` facts; detail and comparison rows. |
| 15 | Assessment labels and text with colour. | Unit tests, e2e and axe. |
| 18 | Basic auth, 2 retries with urllib3 backoff, 25 s request timeout, sanitised errors. | `mim.test.ts` retry, timeout and auth tests. |
| 20 | 6-hour MIM cache, deliberate load. | `mim.test.ts` expiry test; e2e load. |
| 22 | MIM render limit of 24 that leaves matching and counts unchanged. | e2e: 24 of 30 rendered, then "Show all". |
| 23 | Vendored agency marks for curated records; none for MIM. | Build-time glob with the manifest; visual check. |
| 24 | Applying a profile sets criteria, family, scope and unreported values. Other refinements are retained, and re-applying resets. | `domain.test.ts` profiles; e2e apply, undo and restore. |
| 27 | Custom-profile name rules (≥ 3 characters, whitespace collapse, case-insensitive uniqueness including built-ins), `custom-<hex>` IDs, legacy `to_dict` shape, delete. | `parity-app.test.ts` names; e2e CRUD. |
| 28 | Precise numeric entry, presets and ranges. | URL validation tests; e2e range error. |
| 31, 33–35 | Comparison fields, difference highlighting (not ranking), technical details, unavailable links, education text, assessment disclaimer. | e2e journey and comparison rows. |
| 36–38 | Research-log integrity (one row per product × field), fallback datasets. | `domain.test.ts` research log; catalogue parity. |
| 39 | `tools/populate_ceos_ard.py` and `tools/fetch_agency_logos.py` maintenance workflow. | Rebuild reproduced the committed data (line endings only). Documented in the README. |
| — | Built-in profile definitions and values. | `profiles_normalised.json` parity; e2e checks Monitor Change applies `rev ≤ 5 Required`, `res ≤ 30 Preferred`, family SR. |
| — | Terminology: group constants, profile names, "Nominal revisit". | Parity group names; README and glossary. |

## Intentional changes (not regressions)

| Change | Prototype behaviour | Rebuilt behaviour | Verified by |
|---|---|---|---|
| Neutral default browsing | Explore preset auto-applied (spatial ≤ 30 m Preferred). | All families, assessed scope, no criteria, "Browse products". The Explore preset is unchanged when applied deliberately. | e2e neutral state; unit |
| No hidden launch-year restriction (#9) | `launch_year_filter = 2015`. "Keep unreported" also hid unknown years, which hid every curated record. | No launch-year control and no clause. Evaluator kept as `legacyLaunchYear` for parity. | `domain.test.ts` hide-unreported; parity filter scenarios |
| Inline importance editing (#25) | Mode inherited from the profile; changing it required Profile Builder. | Required / Preferred / Ignore next to each criterion. | e2e |
| Explicit clear and reset (#29) | "Clear filters" also re-applied profile defaults. | **Clear criteria** keeps scope; **Restore profile defaults** is separate; Undo is offered. | e2e, unit |
| Manual-check counts and reasons | Hidden behind a checkbox; one group. | Always counted. "Reported outside a requirement" and "Need evidence" are split in core order, each record counted once, with mixed reasons shown. | `domain.test.ts`, e2e |
| Independent shortlist | One 3-item comparison list. | Shortlist (≤ 60) plus a comparison subset (≤ 3); removing a column keeps the entry. | e2e four-and-three test |
| Access and evidence presentation (#14) | Card showed update frequency *instead of* revisit. | Separate labelled temporal facts and three-concept sections; access action with a documentation fallback. | e2e, unit comparison example |
| Session/URL persistence | Streamlit session only; lost on reload. | URL contract v1 plus versioned sessionStorage. | `state.test.ts`, e2e reload and back/forward |
| No automatic filter relaxation (#21) | MIM load set scope to All, showed unknowns and manual checks. | No changes; hidden records are explained, with an explicit broaden action. | e2e MIM |
| MIM refresh (#20) | Cleared the cache and unloaded MIM. | Cooldown-limited re-fetch; last good data kept on failure. | `mim.test.ts`, e2e |
| FedEO removed | Optional sidecar and discovery. | No modules, routes, UI, configuration or requests. Historical report kept with a banner. | e2e request isolation; repository search |
| Profile carousel and Profile Builder tab (#24, #27) | Four-tile carousel; separate builder tab. | Profiles dialog beside criteria ("Illustrative starting points" plus "My profiles"), with preview, undo and explicit save. | e2e |
| Cards per row and group-by (#30) | 2/3/4 columns; "Group by PFS" actually grouped by mission prefix. | Responsive grid; mislabelled grouping not carried forward. | Documented |
| Bounded MIM loading (#4 audit) | No overall deadline. | 60 s deadline, 20 MB response and 5,000-product caps. | `mim.test.ts` |
| Stricter catalogue validation | Field types unchecked; ID-less rows skipped silently. | Field types and stable-ID pattern validated; skipped rows reported as warnings. | `parity-catalogue.test.ts` |

## Bug fixes (separate from parity)

| Fix | Detail | Test |
|---|---|---|
| Origin restriction (#3) | Schema URL, `servers[0]`, product and instrument URLs and redirects must stay on the configured origin and base path before credentials are sent. | `mim.test.ts` untrusted-URL cases |
| "Modified" includes coverage (#26) | `filters_changed` ignored coverage. The new `profileModified` compares every criterion; `legacyFiltersChanged` is kept for parity. | `domain.test.ts` |
| Comparison placeholders (#32) | IDs without a loaded record are shown as labelled placeholders instead of being dropped silently. | e2e unresolved IDs |
| MIM mission placeholder (#40) | `"Not reported by MIM product endpoint"` was searchable data. It is now null in the browser representation. | `mim.test.ts` |
| Pinned legacy requirements | Streamlit 1.65 broke 19 AppTest tests. | Legacy CI job pins 1.59.1 |

## Open for the owner

- **MIM mission-endpoint coupling** (audit §5.2) is preserved for parity. Decide whether products should load when the schema has no missions endpoint.
- **Live MIM** was not called. Schema-discovered URLs are now restricted to the configured origin and API path. If the live service declares its schema outside `MIMS_API_BASE_URL`'s path the origin check still allows it, but data endpoints must sit under the base path.
- **Guided onboarding depth** (design brief §6) is left for real-user testing; family help, glossary and notes are provided.
- **Legacy reference removal** happens after the owner accepts parity (see `legacy/streamlit-prototype/README.md`).
- **`tmp/` review proposals** (for example Landsat `uint16`) were not applied; they need owner review through the population tool.
- **SvelteKit 3 upgrade** is deferred, because the release is only days old.
