# C-QAS report format (`cqas-report/1`)

A C-QAS report records the results of C-QAS checks on **one scene** of one product: PFS findings for selected requirements, a geometric accuracy test and a radiometric accuracy test. One JSON file drives both the [C-QAS reporting demo](https://alexbrooksga.github.io/CEOSARD-CQAS-Reporting/) and the C-QAS section of the Product Explorer, so the two always show the same values.

> **Current status.** The C-QAS system that runs the metadata, geometric and radiometric tests is still being built. The only report is an **example** (`data_status: "example"`) built from the original C-QAS report mock-up. Every view shows it as "Concept — example data". When C-QAS produces real output, it writes this format and the example file is replaced; no view code needs to change.

## What a report is, and is not

| Layer | Source | Meaning |
|---|---|---|
| CEOS MIM database | Agency survey | What the mission and instrument are, as declared |
| CEOS-ARD assessment | Self-assessment and WGCV peer review against a PFS | The product collection conforms at Threshold or Goal |
| **C-QAS report** | C-QAS run on one scene | What was measured for that scene |

A C-QAS report is **not** a CEOS-ARD assessment, does not establish collection-wide suitability, and never affects filtering, matching or ordering in the Product Explorer.

## Location and naming

- Product Explorer: `data/cqas/<product-id>.json`, where `<product-id>` is the curated product's stable ID (for example `landsat-c2-sr`). Files are validated when the server starts and by `npm test`.
- Reporting demo: a copy at `cqas-report.json` in the repository root, embedded in `index.html`. `tools/sync-report.mjs` in that repository refreshes the embedded copy and fails if they differ.

## Fields

Required unless marked *optional* (optional fields may be `null` or omitted). Dates are ISO `YYYY-MM-DD`.

### Top level

| Field | Type | Meaning |
|---|---|---|
| `schema` | `"cqas-report/1"` | Format version. A breaking change uses a new version. |
| `data_status` | `example` \| `provisional` \| `reviewed` | `example`: mock values. `provisional`: produced by C-QAS, not reviewed. `reviewed`: reviewed output. Views label anything other than `reviewed`. |
| `status_note` | text | One sentence shown beside the status label. |
| `report_id` | text | Report identifier, e.g. `DEMO-L8-001`. |
| `report_date` | date | Date the report was produced. |
| `findings_summary` | text | One plain sentence summarising the Not met findings. |
| `next_action` | text | The single most important next action (Simple view). |
| `next_actions` | list of text | All next actions (Advanced view). |
| `scope_note` | text | The scope statement shown at the foot of every view. |

### `product`

| Field | Type | Meaning |
|---|---|---|
| `explorer_id` | stable ID | Product Explorer product ID. Must exist in the curated catalogue. |
| `name` | text | Product name as checked (may be narrower than the catalogue record, e.g. one mission). |
| `short_name` | text | Short label for headings. |

### `pfs`

| Field | Type | Meaning |
|---|---|---|
| `name`, `short_name` | text | PFS family, e.g. `Surface Reflectance`, `SR`. |
| `version` | text | PFS version the checks used, e.g. `5.0.2`. Views warn when this differs from the version of the product's CEOS-ARD assessment. |
| `total_requirements` | integer ≥ 1 | Requirements in the PFS. Counts are always shown against it ("9 of 36"). |

### `scene`

| Field | Type | Meaning |
|---|---|---|
| `product_id` | text | Provider scene identifier. |
| `platform`, `instrument` | text | E.g. `Landsat 8`, `OLI`. |
| `acquisition_date` | date | |
| `path`, `row` | integer, *optional* | WRS path and row, where applicable. |
| `reference_site` | object, *optional* | `network`, `code`, `name`, e.g. RadCalNet `RVUS` Railroad Valley Playa. |
| `note` | text, *optional* | Caveat about the input scene. |

### `run`

| Field | Type | Meaning |
|---|---|---|
| `code` | text | Run code. Must equal the segment codes joined by `-`. |
| `segments` | list | Each `{ code, part, meaning }`; explains one part of the run code. |
| `snapshot` | text | Assessment snapshot identifier. |
| `reviewer` | text, *optional* | `null` shows "Reviewer unassigned". |
| `note` | text, *optional* | |

### `findings` (list, at least one)

| Field | Type | Meaning |
|---|---|---|
| `requirement` | text | PFS requirement name. |
| `id` | text | PFS requirement identifier, unique within the report. |
| `threshold`, `goal` | `Met` \| `Not met` \| `Not assessed` \| `Not required` | Outcome at each PFS level. `Not assessed` means not tested; `Not required` means the PFS has no requirement at that level. |
| `reason` | text, *optional* | Why a requirement is Not met or Not assessed. |

### `geometric`

| Field | Type | Meaning |
|---|---|---|
| `label`, `method`, `reference`, `comparison` | text | Test identity, method version, reference and comparison type. |
| `method_notes` | text, *optional* | |
| `pixel_size_m` | number | Native grid, used to convert pixels to metres. |
| `radial_rmse_px` | number | Headline radial RMSE in pixels. |
| `comparisons_px` | list of numbers | Radial error of each comparison, in pixels (plotted). |
| `limit_px`, `limit_source` | number, text, *optional* | Numeric limit and where it comes from (e.g. `PFS Threshold`). |
| `matches_accepted`, `matches_total` | integers | Accepted ≤ total. |
| `positional_uncertainty` | text, *optional* | `null` shows "not estimated". |
| `absolute_accuracy`, `numeric_test`, `requirement_result` | `Met` \| `Not met` \| `Not assessed` | Absolute accuracy against an independent reference; the numeric limit test; the full PFS requirement. |
| `requirement_reason` | text, *optional* | Why the full requirement is not met. |

### `radiometric`

| Field | Type | Meaning |
|---|---|---|
| `label`, `method`, `reference`, `comparison` | text | As for geometric. |
| `method_notes` | text, *optional* | |
| `units` | text | Reflectance units, e.g. `1`. |
| `headline_band`, `headline_band_name` | text, text *optional* | Band shown in the headline; must be one of `bands`. |
| `bands` | list | Each `{ band, difference, uncertainty_k1 }`: observed minus reference, and standard uncertainty at k = 1. Views derive k = 2 by doubling. |
| `pixels_used`, `pixels_total` | integers | Used ≤ total. |
| `unique_exclusions` | integer, *optional* | |
| `product_uncertainty` | text, *optional* | `null` shows "missing". |
| `accuracy_test`, `uncertainty_goal` | `Met` \| `Not met` \| `Not assessed` | |
| `accuracy_reason`, `uncertainty_goal_reason` | text, *optional* | |

## Adding or replacing a report

1. Write `data/cqas/<product-id>.json` in this format.
2. Run `npm test`; validation lists every problem in the file.
3. Copy the file to the reporting demo as `cqas-report.json` and run `node tools/sync-report.mjs` there.
4. Rebuild and republish both.
