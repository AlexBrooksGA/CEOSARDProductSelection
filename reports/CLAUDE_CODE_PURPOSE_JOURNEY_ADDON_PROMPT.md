# Claude Code implementation prompt: purpose-led entry and fitness-for-purpose journey

Implement an incremental enhancement to the existing CEOS-ARD Product Explorer. The web-native rebuild has already been completed. Work in the current application; do not rebuild it again or reconsider the framework.

## Objective

Help users describe what they need Earth observation data for, understand a sensible starting set of requirements, discover candidates, and justify their shortlist using available evidence and explicit outstanding checks.

The opening experience should be a polished, engaging sentence or short paragraph with blanks users complete through accessible inline selects, a few options, and optional text input. It should feel like forming a useful question, not completing an administrative form. A realistic satellite-inspired background changes gently as relevant choices change.

The journey prepares filters and applies them once, on an explicit action. It then hands control to the existing Explorer and its left-hand filters. Keep one shared interface, not beginner/intermediate/expert modes. Provide a clearly discoverable “Skip to catalogue” action in the top right.

This brief supersedes the earlier rebuild prompt where that prompt relegated guided use cases to a future enhancement, prioritised catalogue-first entry for every fresh visit, or discouraged an introductory hero. Preserve its architectural, scientific, provenance and matching safeguards. Helping users assess fitness for purpose is now a core workflow.

## 1. Inspect the current application before making changes

Read applicable repository instructions. Inspect the working tree without overwriting unrelated or uncommitted work. Read and run the existing application where possible, then identify what already exists and can be extended. Start with:

- `README.md`, `REFERENCE_DESIGN_GUIDE.md`, `docs/ARCHITECTURE.md`, `docs/STATE_CONTRACT.md`, and the audit under `docs/rebuild/`.
- `reports/CEOS_ARD_PRODUCT_EXPLORER_DESIGN_BRIEF.md` and `reports/CLAUDE_CODE_REBUILD_PROMPT.md` as earlier context, subject to the scope changes above.
- Discovery, product details and shortlist routes; `CriteriaPanel`, `ProfilesDialog`, `ProductCard` and `CompareTable`.
- Domain modules for profiles, criteria, matching, presentation, comparison, provenance and summaries.
- URL/session state, catalogue loading, `data/default_profiles.json`, the curated catalogue and research log.
- Existing unit, parity, state, accessibility and end-to-end tests.

Record a short audit and implementation plan identifying reusable components, genuine gaps and proposed state changes, then proceed with implementation. Distinguish runtime observations from code inference. Resolve routine design choices yourself. Ask only if a material owner decision blocks a scientifically honest implementation; use explicit unknown/manual checks where evidence is unavailable.

Preserve the existing SvelteKit/TypeScript/plain CSS application, one codebase and one Node.js deployment. Keep curated data in version-controlled JSON, with no database initially. Keep MIM requests, credentials, validation and caching on the server, and matching/filtering/comparison in the browser. Keep FedEO removed. Do not deploy or publish as part of this task.

## 2. Supplied imagery: exact local location

The visual source is already available in the project:

`assets/design/purpose-journey/earth-observation-states-concept.png`

Absolute Windows path:

`C:\Users\Alexander\Documents\product selection\assets\design\purpose-journey\earth-observation-states-concept.png`

Read `assets/design/purpose-journey/README.md` and inspect the image before using it.

It is a single 2007 × 783 pixel board containing six panels: optical, radar-inspired and thermal-inspired columns, with finer detail above and coarser detail below. It is an AI-generated fictional landscape. It is a visual concept, not real satellite data, calibrated resolution, a physical sensor simulation or product evidence. Artistic alignment between panels is approximate.

You do not need an image-generation service. Use local image-processing tools to extract clean panels, excluding all embedded text, labels, gutters and footer. Preserve the source. Create and optimise derivatives under:

`static/images/purpose-journey/`

Suggested names: `optical-fine.webp`, `optical-coarse.webp`, `radar-fine.webp`, `radar-coarse.webp`, `thermal-fine.webp`, `thermal-coarse.webp`.

These six derivatives do not exist yet. Verify crops visually and at their actual display sizes. Each source panel is only approximately 600 × 335 pixels: use atmospheric treatment and sensible sizing, not claims of high-resolution source detail. Do not stretch the whole contact sheet across the page. Render all interface text and controls in HTML, not inside images. No runtime image-generation API, video or new external image dependency is needed.

## 3. Entry experience and sentence builder

For a fresh visit with no meaningful saved selection or search state, open the guided entry. The normal site identity, theme control and skip action remain accessible. Do not force onboarding in front of meaningful shared URLs, direct product/comparison links, or a restored active session. A baseline version query parameter alone must not be mistaken for meaningful selection state.

Use concise wording such as:

> Find Earth observation data for your purpose.
>
> I want to [monitor change] in [wetlands],
> to understand [seasonal changes in inundation].

Reveal relevant follow-ups, for example:

> My area is [optional place or description] and my period is [optional dates].
> I need to distinguish [small features / broad patterns / help me decide]
> and observe changes [frequently / seasonally / over many years / not sure].

These are interaction examples, not prescribed scientific categories or requirements. Adapt the wording coherently to the selected purpose; avoid combinations that produce nonsensical sentences. Start with roughly three meaningful choices and reveal only useful follow-ups. Always offer a route for a custom purpose and “Not sure.” Allow incomplete but useful drafts to progress.

Keep the sentence engaging on desktop, with clear affordances for editable blanks. On narrow screens, let it become a readable sequence of labelled controls rather than tiny selects embedded in wrapped prose. Labels, instructions and error messages must remain programmatically associated with their controls.

Do not require users to know a sensor, provider or Product Family Specification. Offer measurement choices when relevant, using plain-language explanations alongside established names: Surface Reflectance (SR), Synthetic Aperture Radar (SAR), and Surface Temperature (ST). “Help me decide” is valid. Do not force a measurement-family constraint merely because one background image is displayed.

Typed purpose, place and dates are user context. Do not pretend literal catalogue search interprets them, geocodes them, verifies observation availability or infers scientific requirements. No chatbot or language-model service is in scope.

## 4. Preview, apply once, then explore

Maintain a journey draft separately from active Explorer state. Changing answers may update the visual background and a preview, but must not silently mutate the live filters or shortlist.

Show a compact preview containing:

- The user's purpose and intended output.
- Proposed filters and their Required/Preferred/Ignore settings, with reasons.
- Assumptions and requirements the current catalogue cannot check.
- Any existing independent constraints that will remain active.

Use the primary action “Find candidate products” to apply the reviewed settings once and enter results. Keep the existing filter controls on the left on desktop and their accessible responsive equivalent on mobile. Focus the results heading appropriately. Do not automatically pick or shortlist a product.

After applying:

- Manual filter changes remain authoritative. No reactive effect may keep restoring journey defaults.
- Show a compact “Your purpose” summary and an Edit action above results. Indicate when filters have been adjusted since the initial setup.
- Reopening the journey preserves the current shortlist, comparison, profiles and notes. Preview a settings diff before applying edited answers. Offer Undo for the application action.
- Define how clearing criteria differs from clearing purpose; keep both behaviours understandable. Do not silently erase task context when clearing a technical filter.
- Skipping changes no existing criteria. From a genuinely fresh state it opens neutral catalogue browsing. Retain the draft in the session and offer “Start with your purpose” from results.

Keep existing built-in profile definitions and saved profile compatibility. Do not silently rewrite the old “Monitor Change Over Time” five-day revisit requirement or treat it as a universal recommendation. Any new guided mapping must be explicit, separately versioned and justified. Preserve the existing matcher for equivalent inputs.

## 5. Make fitness for purpose useful throughout the journey

A use case is more than a filter preset. Add a small, typed, version-controlled guidance model covering purpose/question, intended output, applicable context, relevant measurements, suggested criteria with reasons, assumptions, limitations, evidence checks, sources and review status/version. Reuse and extend existing models where appropriate; avoid duplicate state or a generic rules-engine framework.

Keep three concepts distinct:

1. CEOS-ARD assessment: conformance with the relevant Product Family Specification (PFS).
2. Measured quality and integrity evidence: available checks or uncertainty information, with source, scope, method/date and product version where known.
3. Application suitability: whether evidence supports this user's particular requirements.

Begin with one useful illustrative wetlands/change-monitoring journey and a custom-purpose route. Make other starter choices only as specific as available guidance supports. An illustrative label does not excuse invented scientific rules. Do not create a broad domain catalogue as part of this change.

Existing resolution/revisit/bit-depth/coverage rules may screen existing fields. Do not automatically translate “small features” into an invented metre threshold or “seasonally” into an arbitrary revisit limit. Where no reviewed mapping exists, provide explanation and let the user set a technical criterion, or keep the requirement as an explicit manual check.

Never equate pixel spacing with feature detection or positional accuracy; nominal revisit with usable observations, continuity or delivery; storage bits with radiometric quality; broad geographic coverage with actual local availability; or assessment with suitability.

Carry the purpose into:

- **Results:** a concise purpose/criteria summary and clear reasons for existing screening outcomes.
- **Details:** extend “My requirements and open checks” with task-relevant evidence, limitations and next checks. Keep assessment and measured-quality sections distinct.
- **Comparison:** prioritise the user's requirements and outstanding checks, while retaining the technical comparison and optional fields. Compare equivalent evidence only.
- **Selection summary:** include purpose, guidance version/status, assumptions, applied criteria, user rationale, evidence links, outstanding checks and next access actions.

Use specific outcomes such as “Reported value meets your criterion,” “Outside your requirement,” “Evidence needed,” and “Manual check.” Keep user-entered conclusions distinct from sourced facts. Missing evidence is not poor quality. Avoid overall quality/suitability scores, “best product” claims or invented official classifications.

Where the desired output is thematic (for example an inundation map) and a candidate is an input measurement, explain the remaining processing/validation work. Do not claim the Explorer performs it.

For every important open check, give a useful next action using existing documentation, validation or access links. Keep the service useful when evidence is unavailable, unreported, outdated, incomparable or temporarily inaccessible.

## 6. Premium visual direction

Make this feel like a carefully designed Earth-observation service: confident typography, realistic landscape imagery, generous space, clear visual hierarchy and exceptionally clean controls. Use the existing visual guide and locally available Space Grotesk/Space Mono fonts as the base. The introductory hero is an intentional extension to that system.

- Build a responsive atmospheric hero with the imagery behind the introductory content. Use a stable dark navy scrim/gradient protecting all text and controls. Maintain a readable hero treatment in both themes while the surrounding UI follows the selected theme.
- Prefer restrained teal/cyan accents, subtle borders and measured depth. The completed blanks should feel tactile and selectable, with strong focus and selected states.
- Make one primary action visually clear. Place “Skip to catalogue” in the top right; small relative to the main action, but not faint or difficult to target. Use at least 44px touch targets.
- Use cinematic realism without cartoon planets, decorative orbiting satellites, fake telemetry, neon HUD clutter or a generic stack of translucent cards.
- Support wide desktop and narrow mobile layouts. Do not let a full-height hero hide the action below the mobile keyboard, trap scrolling or leave excessive empty space.
- Use short, calm transitions (approximately 200–400ms) without layout jumps. Crossfade imagery; do not morph approximately aligned panels into fake geographic motion. Do not animate continuously.
- As a chosen measurement changes, show the corresponding optical/radar/thermal treatment. An undecided or unsupported family uses a neutral treatment without inventing another measurement depiction.
- Where a spatial-detail choice is meaningful, change the illustrative finer/coarser state. Preserve framing and avoid confusing resolution with zoom. These are qualitative visual states, not calibrated previews at a stated number of metres and not evidence of product quality.
- Do not change imagery for answers that it cannot honestly illustrate. Do not imply the fictional background represents the typed area or dates.
- Keep a small visible “Illustrative imagery” label, with an accessible explanation that it is AI-generated and not measured product data.
- Respect reduced-motion preferences. Decorative imagery should not create screen-reader noise. Use real labels and keyboard-operable controls, with adequate contrast throughout every background state.
- Reserve dimensions to prevent layout shifts. Load the initial asset efficiently; preload alternatives judiciously, and optimise responsive derivatives. If images fail, the gradient and form must still work.

Once users enter results, collapse the large introductory treatment to the compact purpose summary. Keep the working catalogue efficient and visually consistent with the new entry experience.

## 7. State, architecture and compatibility

Separate UI components, pure domain logic, browser/session state and server integrations. Proposed concerns include a purpose draft, versioned guidance definitions, an explicit answer-to-criteria mapping, manual evidence checks and the background visual state. Background state must never be a hidden source of filtering decisions.

Use validated, versioned session storage for custom purpose text, area/period descriptions, draft answers, private checks and notes. Retain in-memory work gracefully if storage fails. Keep saved custom profiles compatible.

Extend the existing URL contract carefully for public use-case ID/version where useful and resolved public criteria/selections. Private purpose text, precise locations and notes must not leak into URLs by default. Explain what shared links reproduce and what remains session-only. Unknown/missing guidance versions must not silently load different rules; preserve valid resolved criteria and explain the missing context.

Explicit meaningful URL state wins over session defaults. Preserve back/forward behaviour, reloads and direct links without onboarding loops. Do not introduce server-global user state.

Keep the existing matcher, unknown handling, ordering, provenance and MIM boundaries. Future quality/integrity monitoring can supply evidence later; no new live feed, fabricated CQAS specification or operational dependency belongs in this add-on.

## 8. Source context and editorial boundaries

These sources explain the strategic direction. Consult them if accessible; if access is unavailable, say so and do not invent source contents or endorsement:

- Draft CEOS-ARD Strategy 2026–2031, especially Pillar 3 and the water annex: https://docs.google.com/document/d/1013SY10nNC8287sr_5ldsqJgh750GbW7HDJqpr44CKI/edit?tab=t.0
- Initiatives and Tasks, especially proposed 2026-0039 (selection framework/profiles), 2026-0035 (application guidance), 2026-0034 (future classifications), and 2026-0062 (use/impact): https://docs.google.com/spreadsheets/d/1F8MkfeosttpELyhBlltFDZ9F13aEz15g9m2QlMnk_DU/edit?gid=765187891#gid=765187891
- Approved CEOS Interoperability Handbook 2.0: https://github.com/ceos-org/interoperability-handbook and its Quality.md, particularly CALVAL#2–3.
- LSI-VC-17 minutes: https://ceos.org/document_management/Virtual_Constellations/LSI/Meetings/LSI-VC-17/LSI-VC-17%20Minutes%20v1.0.pdf

The draft strategy proposes fitness-for-purpose profiles and application guidance. This supports the direction; it does not make this implementation an official CEOS suitability assessment. Its suggested future maturity/quality classifications must not be implemented as established labels. Keep additional product information modest and sourced from CEOS, providers or closely related authoritative guidance.

Do not edit the linked Google documents or sheet. Domain-guidance review status must be honest: distinguish illustrative guidance, user-defined requirements and any genuinely reviewed material. Do not fabricate domain-expert approval.

## 9. Verification and completion

Use the current tests to protect equivalent behaviour. Add focused tests for the new state transitions and observable workflow, not snapshots that merely mirror markup. Verify:

1. A fresh visit presents the journey; Skip opens neutral browsing; meaningful shared/direct links bypass it.
2. Draft answers change the preview without changing active filters. Apply changes filters exactly once. Later manual edits are never overwritten automatically.
3. Edit/reapply/undo, navigation and reload retain shortlist, comparison and notes. Changed purposes flag affected rationale/checks for review.
4. “Not sure,” incomplete optional fields and a custom purpose remain usable without fabricated filter values.
5. Every proposed criterion has an understandable reason and mode; unsupported checks remain visible. Free text is not passed off as semantic search.
6. Comparison and copied summaries carry purpose and outstanding checks, while assessment, measured evidence and suitability remain distinct.
7. Existing matching parity, unknown-value handling, profile behaviour and MIM tests still pass. Preserve provenance and old shared-link compatibility.
8. Guidance version mismatches, corrupt/unavailable session storage, zero results and imagery failures recover without losing valid state or hiding constraints.
9. Keyboard/screen-reader use, reduced motion, contrast and responsive layouts work. Capture and inspect screenshots at desktop and narrow mobile sizes, in both themes and representative image states; correct clipping, low contrast, awkward sentence wrapping and pixelated distractions.

Run the existing relevant checks, unit tests, build and end-to-end suite (the repository currently provides `npm run verify`; inspect current scripts before use). Report results and any genuine verification limitations without claiming unrun checks passed.

Deliver the implemented add-on, prepared image derivatives, updated local architecture/state documentation where needed, and a concise summary of changes, validation and remaining scientific/editorial review needs. Include screenshots demonstrating the finished entry and its transition to results. Do not deploy.
