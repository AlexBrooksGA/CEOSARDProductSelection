# Optional FedEO integration assessment

Validation date: 20 July 2026 (Australia/Sydney)

## Outcome

FedEO is implemented as an optional experimental metadata and discovery sidecar. It is available behind `ENABLE_FEDEO_INTEGRATION`, disabled by default at the user toggle, independent of MIM, bounded and cached, and failure-isolated. It does not mutate catalogue or MIM `Product` objects and therefore cannot change filters, selection criteria, match ordering, comparison state, curated records, or MIM results.

The implementation uses only collection metadata. It does not query FedEO items or granules and does not make the application dependent on FedEO availability.

## Existing application architecture

- `catalogue.py` loads the 26 researched CEOS-ARD records from `data/ceos_ard_products.json` and creates the existing flat `Product` model. The older demo/status overlay remains only a fallback.
- `mims_api.py` is a separate authenticated adapter. The Streamlit call site caches its joined product/instrument response for six hours, and it runs only after the existing MIM checkbox and load button are used.
- `app.py` combines local records and already-loaded MIM records, applies metadata filters, computes profile matching, and then limits only rendered MIM tiles.
- `matching.py` reads the four existing selection inputs directly from `Product`: spatial resolution, revisit, radiometric bit depth, and coverage.
- `components.py` renders product cards and comparison content from `Product`.

Because filters and matching read the flat product directly, merging FedEO values into `Product` would risk changing selection behaviour. The safe seam is a run-local sidecar keyed by the existing product ID and passed only to card rendering.

## Agreed integration design

The architecture, FedEO API, and matching/normalisation workstreams compared their repository and API findings before implementation and agreed on one design:

1. Build an immutable matching identity from an existing product without changing it.
2. Use an explicit FedEO collection identifier from an existing official FedEO URL when available.
3. Otherwise run one bounded collection search using the product title as candidate discovery only.
4. Normalise and score candidates locally. Free-text results never prove identity.
5. Retrieve the selected collection detail and re-check the score before accepting it.
6. Keep exact/high matches in a sidecar; retain possible/no-match/unavailable outcomes only as diagnostics.
7. Render a collapsed, clearly labelled FedEO section on the existing card.

For collection discovery, the workstreams agreed on a second path rather than weakening product matching or appending incomplete records to the product model:

1. The nested **Show additional FedEO collections** control is visible only while the main FedEO toggle is enabled. It defaults on at that point and can be disabled independently.
2. Run one cached collection search for the selected family, or a deterministic active-profile family when the UI is on **All product families**. A meaningful user search term takes priority in the latter case.
3. Request at most 20 collections from one page and perform no detail or item/granule requests.
4. Outside the query cache, normalise and score results against all 26 local products and all session-loaded MIM products, regardless of current filters or MIM visibility.
5. Withhold exact identifiers, high-confidence overlaps, and possible overlaps. Retain materially conflicting variants rather than collapsing them into an existing product.
6. Deduplicate only identical FedEO collection IDs, show at most eight candidates, and retain the remainder as counts.
7. Render candidates in a separate collapsed section after the existing results. Never create a `Product`, change matching/filtering, add a CEOS-ARD badge, or place a candidate in Compare.

The UI states that these are collections for which no reliable overlap was identified in the returned metadata. It does not claim that they are globally new, CEOS-ARD assessed, or suitable for the active profile.

The enabled batch is capped at 12 currently filtered records per run. Successful per-product results are cached independently for six hours. A service-wide timeout, connection failure, HTTP 429/5xx, or malformed top-level search response stops remaining requests and preserves partial successes. Local 404s, ordinary 4xx responses, and malformed individual candidates remain isolated to that product.

## FedEO API findings

The official STAC interface advertises `GET /collections` for collection search, `GET /collections/{collection-id}` for one collection, and `GET /collections/queryables` for searchable collection properties. Granule interfaces include `GET /search`, `GET /collections/{id}/items`, and collection-specific queryables, but this implementation does not call them.

Documented collection search parameters include free text `q`, exact `ids`, `bbox`, `datetime`, `limit`, and CQL2 text using `filter` with `filter-lang=cql2-text`. Advertised collection queryables include title, platform, instrument, organisation, processing level, DOI, publisher, use limitation, offering, parent identifier, modification date, and classified concepts. Exact-title CQL2 matching is equality-based, so free text is used only to discover candidates.

Pagination is represented by response links with `rel="next"`; the client follows only bounded HTTPS links on the official FedEO host and does not construct offsets. FedEO collection identifiers can be provider-specific or hierarchical, and dated catalogue nodes are not necessarily item-searchable. The match model therefore preserves collection ID, provider, and parent context rather than assuming a mission name is one collection.

Official documentation did not publish a rate limit. Practical safeguards are a small result limit, one page, a 12-product enrichment cap, one 20-collection discovery search, six-hour caches, one retry for 429/5xx, no item queries, and 5-second connect/10-second read timeouts. Invalid JSON and malformed top-level search results are controlled service errors; malformed individual candidates are skipped.

## Files added and modified

| File | Change |
|---|---|
| `fedeo_api.py` | Added bounded collection search/detail client, timeouts, controlled errors, and safe pagination. |
| `fedeo_normalisation.py` | Added stable fields, aliases, provenance, URL classification, and raw-response retention. |
| `fedeo_matching.py` | Added identities, confidence categories, conservative scoring, precedence, batch diagnostics, and outage circuit breaker. |
| `fedeo_discovery.py` | Added deterministic family queries, bounded normalisation, all-known-product overlap screening, exact-ID deduplication, and display caps. |
| `fedeo_ui.py` | Added the optional, nonempty FedEO card expander and separate discovery-candidate expander. |
| `app.py` | Added the config gate, default-off sidebar toggle, nested discovery control, independent caches, guarded sidecar lookups, and card pass-through. |
| `components.py` | Added one optional card argument and one FedEO renderer call. |
| `.env.example` | Documented the availability flag. |
| `README.md` | Documented operation, limits, and rollback reference. |
| `tests/test_fedeo_api.py` | Added mocked client/error/pagination tests. |
| `tests/test_fedeo_normalisation.py` | Added schema/alias/temporal/storage/raw-response tests. |
| `tests/test_fedeo_matching.py` | Added exact/high/possible/no-match/conflict/precedence/batch tests. |
| `tests/test_fedeo_discovery.py` | Added query, bounded search, raw retention, overlap, variant, context, deduplication, and display-limit tests. |
| `tests/test_app_fedeo.py` | Added Streamlit toggles, no-call, discovery/enrichment rendering, unchanged-card, ambiguity, and failure-isolation tests. |

No changes were made to `models.py`, `matching.py`, `catalogue.py`, `mims_api.py`, catalogue JSON, curated provenance data, product IDs, profiles, or requirements.

## Field mapping

Every mapped value is stored as `FedeoField(value, source, api_path, basis, confidence)`. Standard paths are preferred over aliases, key matching is case-insensitive, malformed types are skipped, and the original response is deep-copied into `raw_response` without discarding unknown fields.

| Internal FedEO field | Preferred path | Accepted examples / fallbacks | Use |
|---|---|---|---|
| Collection ID | `id` | `identifier`, `collection_id`, `properties.identifier` | Identity and record display |
| Title | `title` | `properties.title`, `name` | Matching and display |
| Description | `description` | `properties.description`, `abstract` | FedEO expander only |
| Providers | `providers` | `provider`, provider name/role/url aliases | Matching and display |
| Agency | Derived from providers | Producer/processor/licensor/provider roles; FedEO host excluded | Matching; labelled derived field |
| Platform / mission | `summaries.platform` | `summaries.platforms`, `Platform`, `properties.platform` | Matching and display |
| Instrument | `summaries.instruments` | `summaries.instrument`, `Instrument`, properties/top-level aliases | Matching and display |
| Constellation | `summaries.constellation` | properties/top-level alias | Matching and display |
| Processing level | `summaries.processing:level` | `summaries.processing_level`, `processingLevel`, `ProcessingLevel` | Matching/display; never CEOS PFS/tier |
| Spatial coverage | `extent.spatial.bbox` | `properties.extent.spatial.bbox`, `bbox` | FedEO expander only |
| Temporal coverage | `extent.temporal.interval` | start/end datetime aliases | Empty and open-ended ranges preserved |
| Ground sample distance | `summaries.gsd` | `properties.gsd`, `gsd`, ground-sample aliases | Display only; never product resolution |
| Product type | `summaries.product:type` | `product_type`, `productType` | Matching and display |
| Product version | `version` | `summaries.version`, `product_version`, `productVersion` | Display |
| Data format | `summaries.file:format` | explicit format plus data-role `assets`/`item_assets` media types | Display only |
| Raster data type | `raster:bands[].data_type` | item-asset `dataType`/`dtype` aliases | Display only |
| Output storage bit depth | Derived from raster data type | `uint8/16/32/64`, `int*`, `float*` | Explicitly labelled storage width only |
| Coordinate reference system | `summaries.proj:code` | `proj:epsg`, asset `epsg`/`crs` | Display only |
| Bands | `summaries.eo:bands` | `summaries.bands`, item-asset band dictionaries | Collection metadata display/debugging |
| SAR frequency band | `summaries.sar:frequency_band` | properties/top-level aliases | Display only |
| SAR polarisation | `summaries.sar:polarizations` | British spelling and properties aliases | Display only |
| Instrument mode | `summaries.sar:instrument_mode` | properties/top-level mode aliases | Display only |
| DOI | `sci:doi` | `doi`, `DOI`, properties aliases | Corroborating evidence and display; never exact alone |
| Citation | `sci:citation` | `citation`, properties aliases | Display |
| Licence | `license` | `licence`, properties aliases | Display |
| Use limitations | `useLimitation` | `otherConstraint`, list aliases | Display |
| Data/search/docs/metadata URLs | role-based `assets` and `links` | safe HTTP(S) `href`/`url` | Labelled links |
| Thumbnail / quicklook | role/title/rel classification | collection assets and links | Labelled links |
| Created / updated | `created`, `updated` | `creationDate`, `modificationDate` | Display/debugging |

Collection assets are frequently service or metadata links. A media type becomes a data format only when an asset is explicitly data-like and not metadata. Item assets embedded in a collection may be normalised, but no live item is queried and no granule observation is promoted to a collection-wide fact.

## Product matching strategy

Confidence values are:

- `exact_identifier`: one explicitly configured/linked FedEO collection ID resolves successfully.
- `high_confidence_metadata`: a unique metadata candidate passes every automatic-selection rule.
- `possible_match`: a plausible, ambiguous, incomplete, or detail-degraded result retained only for review.
- `no_match`: a successful lookup produced no sufficiently plausible candidate.

An automatic metadata match requires all of the following:

- score at least 80;
- lead of at least 15 points over the next candidate;
- a strong title match;
- at least two corroborators among platform/mission, instrument, provider, product family, or DOI;
- no explicit platform, instrument, provider, family, processing-level, or product-variant conflict;
- the retrieved detail record still passes the same checks.

DOI contributes evidence but cannot create an exact match because different product families can share one dataset DOI. Discriminating variants such as static layers and mosaics are treated as conflicts when absent from the application product. A free-text `q` result is never attached directly.

`lookup_status` is separate from confidence. `not_queried`, `unavailable`, and `malformed` are never reported as `no_match`.

## Source precedence and provenance

Precedence is explicit by field rather than one global merge:

1. Protected CEOS-ARD assessment fields always come from the existing curated product.
2. Existing nonempty curated catalogue values precede FedEO.
3. FedEO collection metadata may fill eligible non-authoritative display values.
4. FedEO would precede MIM for an eligible non-authoritative display field.
5. Existing MIM values remain when FedEO has no accepted value.
6. Derived FedEO values are labelled by their basis.

Protected fields include CEOS assessment ID/status/verified flag, PFS type/version/value, assessment level and record URL, approval date, self-assessment and peer-review links, assessment tier/notes, geometric accuracy, radiometric accuracy, curated notes, and radiometric bit-depth fields.

The current UI is even more conservative than a merged display model: FedEO is shown in its own section and the main product metrics remain untouched. Provenance retains `source="fedeo"`, exact `api_path`, `basis` such as `collection_metadata` or `derived_from_raster_data_type`, and confidence.

## Automated validation

The network-free suite uses mocked responses. It covers:

- toggle disabled/enabled and zero lookup calls while disabled;
- successful search/detail responses and bounded pagination;
- no match, multiple possible matches, unique high match, explicit identifier match, and detail 404;
- timeout, connection/service failure, HTTP error, retry bound, invalid JSON, and malformed response structure;
- missing `summaries`, missing `assets`, non-standard names, and provider capitalisation;
- empty and open-ended temporal extent;
- raster output-storage conversion without sensor/radiometric inference;
- raw response retention and field-level provenance;
- curated protected fields not overwritten and `Product` not mutated;
- bounded batches, partial-result preservation, and unprocessed status;
- one bounded discovery search, nested opt-out, all-known-product overlap suppression, variant retention, and visible-result cap;
- discovery rendering remains separate from product cards, and discovery failures leave existing cards usable;
- existing MIM normalisation/UI and existing selection tests unchanged.

Final command:

```powershell
python -m unittest discover -s tests -v
```

Result: 80 tests passed. The pre-change baseline was 17 tests passed.

## Manual live FedEO validation

Live read-only validation used the official `https://fedeo.ceos.org/collections` and `https://fedeo.ceos.org/collections/{id}` endpoints on 20 July 2026. The client requests a STAC collection representation; a generic GeoJSON Accept header was observed to return a Feature wrapper for details, confirming the need for explicit content negotiation.

| Application product | Type | Live outcome | Notes |
|---|---|---|---|
| OPERA RTC Sentinel-1 | SAR, CEOS-ARD | Selected `opera-s1-rtc-v1`, high confidence | Main collection scored 90; the distinct static-layer variant scored 60 and was rejected. |
| Sentinel-2 Level-2A | Optical, CEOS-ARD | Possible match only | Multiple provider collections scored equally (90); none was attached. |
| EnMAP | Optical, CEOS-ARD | Possible match only | One broader Level-0/quicklook collection scored 45; not accepted as the assessed product. |
| ALOS-2 PALSAR-2 25m ScanSAR NRB | SAR, CEOS-ARD | No match | Exact product-title search returned no collection; broader ALOS-2 searches returned unrelated biomass/radiance collections. |
| Constellr LSTprecision | Thermal, CEOS-ARD | No match | No candidate returned. |
| DESIS L2A | Optical, CEOS-ARD | No match | Exact title returned no candidate; broader DESIS search found a global hyperspectral collection not claimed as L2A. |
| Deliberately absent test title | Negative control | No match | Empty result returned normally. |

The separate discovery path was also validated live with the default `surface reflectance` query. FedEO returned the configured maximum of 20 collection records on one page; all 20 remained discovery candidates after screening against the 26 local product identities, eight were selected for display, no duplicate ID or malformed response was encountered, and no reliable known-product overlap was identified in the returned metadata. This outcome demonstrates the bounded discovery flow, not that the collections are globally new or absent under other identifiers.

Representative detail responses also confirmed provider variation and sparse fields: Sentinel-2 exposed `item_assets`, GSD, constellation, platform, instrument, provider roles, and metadata/quicklook assets; OPERA exposed DOI, citation, version, product type, an open-ended temporal range, and several hosts; DESIS exposed a UUID collection ID, platform/instrument, provider roles, and an open-ended temporal range but no item assets.

No official FedEO rate limit was found in the official documentation. The implementation therefore uses small limits, one bounded page, independent caching, a 12-product batch cap, no item queries, and a service-failure circuit breaker.

Official references:

- [FedEO STAC API guide](https://fedeo.ceos.org/stac.html)
- [FedEO service documentation](https://fedeo.ceos.org/readme.html)
- [FedEO landing page](https://fedeo.ceos.org/)

## UI description

With the toggle off, the existing Discover/Profile Builder/Compare interface and product cards are unchanged. The collapsed sidebar contains the experimental toggle, no network lookup runs, and there are no FedEO status messages or card sections.

With the toggle on, the sidebar reports counts for accepted, possible, no-match, unprocessed, or service-unavailable enrichment outcomes. Only accepted cards receive a collapsed **FedEO collection metadata** expander below the existing technical details. It identifies FedEO as collection metadata, shows match confidence and only nonempty fields/links, and repeats that curated CEOS-ARD assessment information remains authoritative. Possible matches do not create card sections.

The nested **Show additional FedEO collections** checkbox is then visible and initially on. Its separate sidebar status reports the bounded query, candidate count, and withheld overlap count. When candidates exist, a collapsed **Additional FedEO collections** section appears after existing product results. Each entry is labelled as a FedEO discovery candidate that was not added to the CEOS-ARD catalogue; it has no product card, match group, compare control, or CEOS-ARD status.

The automated Streamlit validation exercised both states and the enabled failure state without exceptions.

## Information FedEO cannot reliably provide

- CEOS-ARD assessment status, PFS, review workflow, approval, assessment notes, or accuracy claims.
- A universal identifier that maps every application product one-to-one to a FedEO collection.
- Consistent provider, platform, instrument, processing level, licence, format, CRS, band, or SAR fields across all providers.
- Sensor quantisation bit depth from raster storage data types.
- Collection-wide claims from one granule's item metadata.
- A guaranteed product resolution from GSD, or usable-observation cadence from temporal extent.
- A documented public rate limit or availability guarantee.
- Proof that a bounded discovery candidate is globally new, absent under another identifier, CEOS-ARD assessed, or suitable for the active profile.

## Rollback

Rollback is mechanical and does not require a migration:

1. Delete `fedeo_api.py`, `fedeo_normalisation.py`, `fedeo_matching.py`, `fedeo_discovery.py`, and `fedeo_ui.py`.
2. Delete `tests/test_fedeo_api.py`, `tests/test_fedeo_normalisation.py`, `tests/test_fedeo_matching.py`, `tests/test_fedeo_discovery.py`, and `tests/test_app_fedeo.py`.
3. In `app.py`, remove the FedEO imports, `ENABLE_FEDEO_INTEGRATION`, `cached_fedeo_enrichment`, `cached_fedeo_discovery_search`, the FedEO status helpers, the `enable_fedeo`/`discover_fedeo` state defaults, sidebar toggle/config branch, guarded enrichment/discovery block, discovery renderer call, and optional match argument passed to `render_product_card`.
4. In `components.py`, remove the `fedeo_ui` import, restore `render_product_card(result)` to one argument, and remove the single `render_fedeo_metadata` call.
5. Remove the FedEO line from `.env.example` and the FedEO sections/file-list entries from `README.md`; delete this report if desired.

Current code anchors are `app.py` lines 33-35, 70, 152-222, 417-431, 636-697, and 781; `components.py` lines 14, 677, and 823; `fedeo_matching.py` line 359; and `fedeo_ui.py` lines 144 and 217. After removal, the original MIM and catalogue paths remain intact because they were never refactored.
