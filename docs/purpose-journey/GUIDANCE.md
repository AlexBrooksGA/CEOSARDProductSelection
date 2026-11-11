# Purpose guidance — version 2

File: `data/purpose_guidance.json` (schema 2, guidance version `2`, mapping version 2). Loader and rules: `src/lib/domain/purpose.ts`.

The entry supports the Fitness for Purpose pillar of the [draft CEOS-ARD Strategy 2026–2031](https://ceos.org/document_management/Meetings/SIT/SIT-41/Documents/DRAFT%20CEOS-ARD%20Strategy%202026-2031%20v0%20April%202026.pdf) (v0.0, April 2026): users can identify what each product is fit for, including its limitations, and non-expert users are helped to avoid misuse. Following the joint WGCV-56 / LSI-VC-19 discussion, purposes are phrased in users' words, not provider metrics.

## Review status

**Illustrative. Not reviewed.** `review.reviewed` is `false`. The guidance, the need-to-family table and the detail and frequency bands were written for the explorer from the cited sources. They have **not** been reviewed or endorsed by CEOS, the Ramsar Convention or domain experts, and the interface says so wherever guidance appears ("Illustrative guidance v2 — not reviewed by CEOS or domain experts").

Do not change `status` or `review.reviewed` without a real, recorded review. When a review happens, record who reviewed it, when and against which version in `review.note`, and bump `version`.

## The seven questions

Step 1 is enough for a result. Steps 2 and 3 are optional and can be skipped.

| Step | Question | Options | Effect |
|---|---|---|---|
| 1 | What is your work about? | Nine themes tied to CEOS (agriculture, forests and carbon, water and wetlands, coasts and oceans, disasters, biodiversity, land degradation, cities, climate) and "something else" | Selects guidance and checks. Never filters. Each theme's menu hint names its CEOS home (Work Plan section, Virtual Constellation or partner). |
| 1 | What do you need to see or measure? | Surface water; vegetation; land cover; ground movement; surface temperature; burnt area; water colour; not sure. Shortened to fit the theme. | **The only filter.** Proposes the measurement family, with the reason shown. |
| 1 | How will you use the data? (optional) | Look at it; map or classify; track change; measure a quantity; combine sensors | Adds checks. |
| 2 | Where? | Global; a continent or region; one country; a specific site | Preferred reported coverage (`Global`, `Continental or multi-country`, `National`; none for a site). |
| 2 | What period do you need? | The last couple of years; since about 2015; a long record; ongoing; specific years | Adds checks (archive length, continuity). Typed years are private. |
| 3 | Smallest thing to tell apart | Buildings or small plots; fields or small water bodies; landscapes; regional patterns; not sure | Preferred spatial resolution at 10 m, 30 m, 100 m or 1 km. |
| 3 | How often do you need a usable look? | Every few days; every couple of weeks; each season; yearly; not sure | Preferred nominal revisit at 5 or 16 days for the first two; the others add a usable-observations check. |

## Mapping version 2 — answers to settings

| Answer | Effect on filters |
|---|---|
| A need served by one family | Sets that measurement family. |
| A need served by optical and radar (surface water) | Sets the combined family value `Surface Reflectance and Synthetic Aperture Radar` (link code `sr-sar`), which keeps both. |
| A need with no assessed products (water colour → Aquatic Reflectance) | Sets that family; the results show the gap with a way to broaden, rather than hiding it. |
| *Not sure* | No family filter. |
| Where, smallest thing, how often | **Preferred** criteria from the band stated beside each option. Preferred orders results and never hides a product. |
| A value typed in *Set a technical limit yourself* | Replaces the band, with the importance the user chooses. |
| Theme, use, period | No filter. They select guidance, wording and checks. |
| Notes and typed years | Private: kept in the browser tab, in the copied summary, never in links or matching. |

Applying sets only the journey-managed settings (family, `geographic_coverage`, `spatial_resolution_m`, `revisit_days`), clears the built-in profile marker and records the public purpose key `theme~need~use` and the guidance version. Everything else is retained and listed in the preview. Links with a version 1 key (`goal~context~question`) show the version notice and keep their filters.

### Bands, not thresholds

The bands are illustrative orderings, not fitness thresholds: they are Preferred only, the reason column names the answer they came from, and the user can change or remove them. Pixel spacing is not feature detectability or positional accuracy, and nominal revisit is not a count of usable observations; matching checks are added and the preview says so next to the technical limits. Band values need review by the relevant Virtual Constellations (an open point for CEOS).

### Known limits

- Reported coverage is a scale (Local → Global), so *a continent or region* cannot tell Africa from Australia. Region tags on each record would fix this.
- 17 of the 26 curated records report no nominal revisit, so the revisit preference orders few products.
- Every reported resolution is 30 m or finer, so the 30 m band separates nothing in the current catalogue.
- The period adds checks rather than ordering: ordering by mission lifetime would need a new screening criterion, which would change the legacy-parity matcher.

## What the guidance contains

| Part | Contents |
|---|---|
| Options | Themes, needs (with family codes `sr`, `sar`, `st`, `ar` and the themes they are offered for), uses, regions (with a coverage level and sentence phrase), timeframes, details (with a resolution band), frequencies (with a revisit band). |
| `general` entry | Every purpose: area and period, quality indicators (CEOS Interoperability Handbook CALVAL#2–3), suitability (LSI-VC-17; CEOS-ARD), plus checks conditional on detail, frequency and period. |
| `change-over-time` entry | Use *track change*: consistency between dates, archive length, stability (WGClimate proposal, joint WGCV-56 / LSI-VC-19 minutes). |
| `measure`, `combine`, `map` entries | Accuracy reporting; combining without hidden bias (draft CEOS-ARD Strategy, pillar 2); map accuracy. |
| `wetlands` entry (illustrative) | Theme *water and wetlands*: seasonal observations, cloud (optical), water under vegetation (radar), smallest wetland, validation, plus family and use notes. All from Ramsar Technical Report No. 10 (2018). |

Checks can be limited with `when` (`uses`, `families`, `timeframes`, `details`, `frequencies`); a need with no family counts as `decide`. A check can `replace` general checks: the wetland checks replace the general smallest-feature and usable-observations checks.

## Show technical detail

The entry has one switch, *Show technical detail*, which sets the `specialist` level; off means the standard view. `EXPERIENCE_DISCLOSURE` in `domain/purpose.ts` sets default open states only. The `new` level remains in the data for older sessions but is no longer offered. Anything the user opens or closes is remembered in the session and wins.

| Level | Opens by default | Closes by default |
|---|---|---|
| New | Measurement family explanations; scope and qualifications on product details | More filters |
| Familiar | (standard view) | |
| Specialist | Starting setup and technical limits in the entry; More filters; processing, instrument and provenance sections on product details | |

## Three concepts kept apart

- **CEOS-ARD assessment** — conformance with a Product Family Specification.
- **Measured quality evidence** — reported accuracy, uncertainty and quality indicators.
- **Suitability for your purpose** — always the user's judgement, recorded as a check outcome ("Checked — supports my use", "Checked — concern", "Not applicable to my use", "Open"). These records are private, never sourced facts, and never filter results.

## Changing the guidance

1. Edit `data/purpose_guidance.json`. Keep ids stable; every check needs `sources` that exist and `next` actions from `access`, `documentation`, `assessment`, `quality` or `external:<source-id>`. A need may combine only families the explorer can filter together (one family, or optical and radar).
2. If a change alters how answers map to settings, bump `mapping_version`. If it changes options, checks or wording users rely on, bump `version`. Links with an older `gv` then show a notice and no purpose checks, rather than applying different rules silently.
3. Run `npm test`. `loadGuidance` rejects invalid ids, unknown sources, invalid next actions, unknown families or themes, unfilterable family combinations, unknown coverage levels and out-of-range bands.
4. Keep bands Preferred. Do not make any answer Required, or add a fitness threshold, unless an authoritative, cited source states it for that purpose and the guidance status reflects a review.

## Sources

- Ramsar Convention on Wetlands (2018). *The use of Earth Observation for wetland inventory, assessment and monitoring* (Ramsar Technical Report No. 10). https://ramsar.org/sites/default/files/documents/library/rtr10_earth_observation_e.pdf
- Committee on Earth Observation Satellites. *CEOS Analysis Ready Data (CEOS-ARD)*. https://ceos.org/ard/
- Committee on Earth Observation Satellites (2025). *CEOS Interoperability Handbook 2.0 — Quality*. https://github.com/ceos-org/interoperability-handbook/blob/main/Quality.md
- CEOS Land Surface Imaging Virtual Constellation (2025). *LSI-VC-17 meeting minutes v1.0*. https://ceos.org/document_management/Virtual_Constellations/LSI/Meetings/LSI-VC-17/LSI-VC-17%20Minutes%20v1.0.pdf
- CEOS-ARD Oversight Group (2026). *Draft CEOS-ARD Strategy 2026–2031*, version 0.0. https://ceos.org/document_management/Meetings/SIT/SIT-41/Documents/DRAFT%20CEOS-ARD%20Strategy%202026-2031%20v0%20April%202026.pdf
- CEOS WGCV and LSI-VC (2026). *Joint WGCV-56 / LSI-VC-19 meeting minutes v1.0*. https://ceos.org/document_management/Working_Groups/WGCV/Meetings/WGCV-56_LSI-VC-19/Joint%20WGCV-56%20_%20LSI-VC-19%20Minutes%20v1.0.pdf
- Committee on Earth Observation Satellites (2026). *CEOS 2026–2028 Work Plan v1.2* (theme hints). https://ceos.org/document_management/Publications/CEOS_Work-Plans/CEOS%20Work%20Plan%202026-2028_v1.2_final.pdf
