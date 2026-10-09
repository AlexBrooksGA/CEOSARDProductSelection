# Purpose guidance — version 1

File: `data/purpose_guidance.json` (schema 1, guidance version `1`, mapping version 1). Loader and rules: `src/lib/domain/purpose.ts`.

## Review status

**Illustrative. Not reviewed.** `review.reviewed` is `false`. The guidance was written for the explorer from the cited sources. It has **not** been reviewed or endorsed by CEOS, the Ramsar Convention or domain experts, and the interface says so wherever guidance appears ("Illustrative guidance v1 — not reviewed by CEOS or domain experts").

Do not change `status` or `review.reviewed` without a real, recorded review. When a review happens, record who reviewed it, when and against which version in `review.note`, and bump `version`.

## What the guidance contains

| Part | Contents |
|---|---|
| Options | Goals (`monitor-change`, `map-features`, `explore`, `custom`), contexts (`wetlands`, `farmland`, `forests`, `coasts`, `urban`, `any`, `custom`), questions (filtered by goal and context), outputs, measurements, detail and frequency. |
| `general` entry | Applies to every purpose: area and period, quality indicators and uncertainty (CEOS Interoperability Handbook CALVAL#2–3), suitability (LSI-VC-17; CEOS-ARD). |
| `change-over-time` entry | For change goals: consistency between dates and archive length. |
| `wetlands` entry (illustrative) | Seasonal observations, cloud (optical only), water under vegetation (radar only), smallest wetland, validation, plus measurement and output notes. All drawn from Ramsar Technical Report No. 10 (2018). |
| Sources | Each has a short label (shown in the interface), full title, publisher, year and https URL (used in the copied summary). |

Checks can be limited with `when` (goals or measurements). An unset measurement counts as `decide`.

## Mapping version 1 — answers to settings

The mapping is deliberately small and explicit.

| Answer | Effect on filters |
|---|---|
| A single measurement (optical, radar, thermal) | Sets the measurement family filter. |
| *Help me decide* or *optical and radar together* | No family filter (all families stay). |
| *Small features* / *broad patterns* | **No numeric criterion.** An explanation and a manual check are added; the backdrop image changes. |
| *Frequently* / *across each season* / *over many years* | **No numeric criterion.** An explanation and a manual check are added. |
| A spatial resolution or revisit value **typed by the user** | Becomes that criterion, with the importance the user chooses (Preferred by default). |
| Goal, context, question, output, area, period | No filter. They select guidance, wording and checks. Area and period are kept as private context only. |

Applying sets only the journey-managed settings (family, `spatial_resolution_m`, `revisit_days`), clears the built-in profile marker and records the purpose key and guidance version. Everything else in the public state is retained and listed in the preview. The built-in profiles, including *Monitor Change Over Time* (5-day nominal revisit), are unchanged and are not used by the mapping.

### No invented thresholds

The cited wetlands case-study notes (for example a preference for fine-resolution data) are context, not limits. No metre or day value is derived from any qualitative answer. Pixel spacing is not feature detectability or positional accuracy, and nominal revisit is not a count of usable observations; the preview says so next to the optional technical limits.

## Three concepts kept apart

- **CEOS-ARD assessment** — conformance with a Product Family Specification.
- **Measured quality evidence** — reported accuracy, uncertainty and quality indicators.
- **Suitability for your purpose** — always the user's judgement, recorded as a check outcome ("Checked — supports my use", "Checked — concern", "Not applicable to my use", "Open"). These records are private, never sourced facts, and never filter results.

## Changing the guidance

1. Edit `data/purpose_guidance.json`. Keep ids stable; every check needs `sources` that exist and `next` actions from `access`, `documentation`, `assessment`, `quality` or `external:<source-id>`.
2. If a change alters how answers map to settings, bump `mapping_version`. If it changes options, checks or wording users rely on, bump `version`. Links with an older `gv` then show a notice and no purpose checks, rather than applying different rules silently.
3. Run `npm test`. `loadGuidance` rejects invalid ids, unknown sources, invalid next actions, unknown families and incomplete source records.
4. Do not add numeric thresholds unless an authoritative, cited source states them for that purpose and the guidance status reflects a review.

## Sources

- Ramsar Convention on Wetlands (2018). *The use of Earth Observation for wetland inventory, assessment and monitoring* (Ramsar Technical Report No. 10). https://ramsar.org/sites/default/files/documents/library/rtr10_earth_observation_e.pdf
- Committee on Earth Observation Satellites. *CEOS Analysis Ready Data (CEOS-ARD)*. https://ceos.org/ard/
- Committee on Earth Observation Satellites (2025). *CEOS Interoperability Handbook 2.0 — Quality*. https://github.com/ceos-org/interoperability-handbook/blob/main/Quality.md
- CEOS Land Surface Imaging Virtual Constellation (2025). *LSI-VC-17 meeting minutes v1.0*. https://ceos.org/document_management/Virtual_Constellations/LSI/Meetings/LSI-VC-17/LSI-VC-17%20Minutes%20v1.0.pdf

The draft CEOS-ARD Strategy 2026–2031 (Google Doc) could not be read beyond its title, so none of its content is attributed here.
