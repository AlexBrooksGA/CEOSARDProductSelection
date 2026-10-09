# Purpose-led entry — audit and implementation plan

Date: 9 October 2026. Brief: `reports/CLAUDE_CODE_PURPOSE_JOURNEY_ADDON_PROMPT.md`.

## Audit (before changes)

**Runtime (observed).** The delivered `web-rebuild` working tree on the owner's computer is byte-identical to the validated build (124 files compared by checksum). `npm run verify` passed at delivery: check clean, 91 unit, build, 28 end-to-end. A fresh visit currently opens Discover in the neutral browse state; there is no entry hero.

**Code (inferred).**

| Area | Reusable as-is | Gap for this add-on |
|---|---|---|
| `domain/explorer.ts` | `ExplorerState`, `clearCriteria`, `matchingCriteria` | No purpose context; no "journey-managed" subset |
| `domain/profiles.ts` | `previewProfile` diff pattern (changes and retained constraints), profile shapes | Diff is profile-specific; needs a purpose-settings equivalent |
| `domain/criteria.ts` | Definitions, `describeTarget`, `criteriaFingerprint` | Fingerprint ignores purpose, so purpose changes don't flag rationale |
| `domain/presentation.ts`, `matching.ts` | Unchanged matcher and reason wording | — |
| `domain/comparison.ts` | Grouped rows, requirements group | Purpose rows and per-check next actions |
| `domain/summary.ts` | Selection summary | Purpose, guidance version/status, assumptions, checks, user check outcomes |
| `state/url.ts` | Versioned v1 contract with validation | Public purpose key and guidance version; "meaningful state" test |
| `state/session.ts` | Versioned, validated, fail-safe adapter | Purpose draft, applied purpose, skipped flag, per-product check outcomes |
| `state/app.svelte.ts` | Undo, announce, `setExplorer` history policy | Journey open/apply/skip/edit/clear actions; entry decision on hydrate |
| `routes/+page.svelte` | Discover grid, `CriteriaPanel`, `ResultsList` | Hero entry, purpose summary above results, focus to the results heading |
| Product details | "My requirements and open checks" section | Purpose-specific checks, measurement notes, processing note, next actions |
| Imagery | — | Six panels to extract; crossfading backdrop |
| Built-in profiles | Unchanged; "Monitor Change Over Time" (5-day revisit) stays as defined | Not reused as the purpose mapping |

## Sources consulted

| Source | Access | Use |
|---|---|---|
| Draft CEOS-ARD Strategy 2026–2031 (Google Doc) | Only page metadata was readable (title: endorsed draft v1.0 for Plenary 2026). Pillar 3 and the water annex were **not accessible**. | Not quoted; no content attributed. |
| Initiatives and Tasks sheet | Readable. 2026-0039 "Develop the CEOS-ARD Product Selection Framework and fitness for purpose profiles…", 2026-0035 "application-specific guidance…", 2026-0034 "classifications of quality/fitness…", 2026-0062 "case studies and impact metrics". | Direction only. 2026-0034 classifications are **not** implemented as labels. |
| CEOS Interoperability Handbook 2.0, Quality chapter | Readable. CALVAL#2 (measurand and uncertainty), CALVAL#3 (quality indicators so users can assess usability). | Wording for quality-evidence checks. |
| LSI-VC-17 minutes | Readable. "Do we want to document quality or guarantee fitness for purpose?"; suitability "requires evaluation against use cases". | Framing: assessment, quality and suitability stay distinct. |
| Ramsar Technical Report No. 10 (Rebelo et al., 2018) | Readable. | Sourced, qualitative wetland checks: cloud limits on optical; SAR penetrates cloud; flooded vegetation under canopy is hard with C-band (L-band may help); seasonal observations; small wetlands; field validation. |

## Plan

1. **Imagery.** Crop six 600 × 330 panels with identical framing from the concept board into `static/images/purpose-journey/*.webp`, with no labels, gutters or footer. Use a neutral navy/teal duotone (CSS) when no single measurement is chosen.
2. **Guidance model.**
   - `data/purpose_guidance.json`, schema 1, guidance version `1`, status `illustrative` and **not reviewed**: goals, contexts, questions, outputs, measurement, detail and frequency options, sources, one wetlands entry and general checks.
   - `domain/purpose.ts` holds the typed loader, sentence wording, the visual state, the explicit answer-to-settings mapping (mapping version 1) and check resolution.
   - Mapping rules:
     - A chosen single measurement becomes the family filter.
     - "Small features", "seasonally" and similar answers become **no** numeric criterion. They produce explanations and manual checks only.
     - Numeric criteria come only from values the user types, with the mode the user chooses.
3. **State.**
   - A journey draft stays separate from `ExplorerState`. Apply sets family plus the resolution and revisit criteria exactly once (push history, with Undo); everything else is retained.
   - Session v1 gains `purpose` (draft, applied, skipped, check outcomes), validated.
   - URL v1 gains optional `pu` (public purpose key built from fixed IDs only) and `gv` (guidance version). Private text, area and period never go into URLs.
   - The rationale fingerprint includes the purpose key.
4. **Entry rule.** The hero shows on `/` only when the URL carries no meaningful state (a bare `v=1` is not meaningful) and the session has no restored state, skip flag or applied purpose. Direct product and shortlist links never show it.
5. **UI.**
   - Hero with a sentence builder: inline selects on desktop, labelled stacked controls on mobile.
   - Live preview with proposed settings and reasons, uncheckable assumptions and retained constraints.
   - **Find candidate products**, and **Skip to catalogue** in the top right.
   - After applying: a compact "Your purpose" summary (Edit / Clear purpose / adjusted-since-setup indicator).
   - Purpose checks with next actions in details, the comparison (first group), shortlist check outcomes (user-entered, labelled) and the copied summary.
6. **Tests.** Unit tests for the mapping, URL/session and meaningful-state rules; end-to-end tests for entry, skip, bypass, apply-once, manual-edit authority, edit/reapply/undo, reload, imagery failure, accessibility and screenshots. Existing parity, profile and MIM suites must keep passing.
