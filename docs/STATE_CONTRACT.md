# State contract

Public, shareable state lives in the URL. Private session state lives in `sessionStorage`. Nothing private is ever put in a URL or sent to the server. Implementation: `src/lib/state/url.ts`, `src/lib/state/session.ts`, `src/lib/state/app.svelte.ts`.

## URL query parameters — version 1

The same parameters are used on `/`, `/shortlist` and `/products/<id>`. Internal links always carry the current query, so moving between pages never loses context.

| Parameter | Meaning | Values and validation |
|---|---|---|
| `v` | Contract version; its presence marks the URL as **explicit** state | `1` |
| `q` | Search text (product and mission names) | ≤ 200 characters; control characters removed |
| `fam` | Measurement family | `sr`, `st`, `sar`, `ar`, `ntl`; absent = all families |
| `scope` | Catalogue/assessment scope | `assessed` (default, omitted), `all`, `in-progress`, `not-assessed` |
| `mim` | Include MIM records when loaded | `1` |
| `unk` | Hide records with unreported values for active criteria | `hide` |
| `prov` | Provider (repeatable) | ≤ 30 values, each ≤ 200 characters, duplicates removed |
| `sensor` | Sensor/instrument type contains | ≤ 100 characters |
| `ops` | Operational status (repeatable) | as `prov` |
| `src` | Record source (repeatable) | as `prov` |
| `res` | Spatial resolution criterion | `<mode>:<value>`, mode `req`/`pref`/`ign`, 0.1–100000 m |
| `rev` | Nominal revisit criterion | `<mode>:<value>`, 0.1–365 days |
| `bits` | Radiometric bit depth criterion | `<mode>:<integer>`, 1–32 |
| `cov` | Reported coverage criterion | `<mode>:<level>`, level `global`, `continental`, `national`, `regional`, `local` |
| `sl` | Shortlisted product IDs, comma-separated | stable IDs only (`[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`), unique, ≤ 60 |
| `cmp` | Compared product IDs, comma-separated | ≤ 3, unique; added to the shortlist if missing |
| `fields` | Optional comparison field groups | `technical`, `instrument`, `provenance` |
| `p` | Built-in profile last applied (informational) | built-in profile ID; custom profile IDs are rejected |
| `pu` | Public purpose key from the purpose entry: `goal~context~question` built from fixed guidance IDs only (`-` for an unset part) | `[a-z0-9-]{1,40}` parts, at most three, joined by `~`. Invalid keys are ignored with a message; the link's criteria are kept. Typed text ("something else…") is **never** encoded |
| `gv` | Purpose guidance version the key refers to | `[0-9A-Za-z.-]{1,20}`. A version this build doesn't have shows a notice and no purpose-specific checks |

Example: `/shortlist?v=1&fam=sr&rev=req:5&res=pref:30&sl=landsat-c2-sr,sentinel2-level2a,enmap-l2a&cmp=landsat-c2-sr,sentinel2-level2a&fields=technical`

### Rules

- **Explicit URL state wins** over session defaults. A page opened without `v` restores the last explicit query from this tab's session, if there is one; otherwise it shows the neutral browse state.
- **Invalid portions are ignored** with a visible recovery message listing what was ignored. A product ID is never replaced by another product.
- **Comparison overflow:** only the first three `cmp` IDs are compared; the others stay on the shortlist, and a message says so.
- **Shortlist overflow:** links carry at most 60 shortlisted IDs. Larger lists are reported, with a pointer to the copied selection summary. Links longer than 4,000 characters show a warning on the shortlist page.
- **Unresolved IDs** (for example MIM records not loaded, or retired catalogue IDs) stay as labelled placeholders with any notes. The user can load MIM deliberately. Credentials always stay on the server.
- **Custom profiles are not shared.** Links carry the resolved criteria, not session-local profile IDs.
- **Meaningful state.** `v=1` on its own is not meaningful state. Any other valid parameter is.
- **Purpose entry rule.** The purpose entry (hero) is shown on `/` only when the URL has no meaningful state **and** the session has no restored query, no applied purpose, no *Skip to catalogue* choice and no custom profiles. Product and shortlist links never show it.
- **Purpose privacy.** `pu` and `gv` carry only fixed IDs and a version. Experience level, region, period, purpose descriptions, notes and check outcomes stay in the session. A recipient of a link sees the public purpose sentence and a note that private details are not shared.
- A link reproduces selections and criteria. It does not reproduce an immutable historical catalogue, and it does not guarantee live availability.

### History

- **Ongoing edits** use `replaceState`: criterion values (debounced), modes, family, scope, filters, shortlist and comparison changes, and comparison field choices. Text typing commits after a pause, so no history entry is created per keystroke.
- **Deliberate actions** push a history entry: *Find candidate products* (applying a purpose), *Clear purpose*, applying a profile, *Restore profile defaults*, *Clear criteria*, *Undo*, broadening the scope from a notice, and page navigation.
- **Back/forward** restores the represented public state. Private notes and profiles are unaffected.

## Session storage — key `ceos-ard-explorer`, version 1

| Field | Contents |
|---|---|
| `customProfiles` | Session profiles in the prototype's `Profile.to_dict` shape. Each is validated on read: name ≥ 3 characters, criteria ranges, enums. |
| `notes` | Per product ID: `rationale`, `openChecks`, the criteria fingerprint at last edit, and `updatedAt`. A changed fingerprint shows **Review rationale: criteria changed**. The fingerprint includes the public purpose key, so changing the purpose also flags rationale. |
| `investigationNote` | Free text, labelled **Does not filter results**. |
| `disclosure` | Remembered open/closed state of disclosures and result sections. Where nothing is remembered, the self-described experience level supplies the default. |
| `lastQuery` | Last explicit public query string, for same-tab restoration. |
| `appliedCustomProfileId` | Custom profile last applied. It is cleared when a link from elsewhere is opened. |
| `profileDraft` | Unsaved profile name and description. This keeps the draft when a name is rejected or the page reloads. |
| `theme` | `light` or `dark` once chosen. Before that, the operating-system preference applies. |
| `purpose` | `draft` (unapplied answers, including experience, region and period choices, validated against the guidance on read; older typed area/period text becomes the "specific place/period" choice), `applied` (answers, key, guidance and mapping versions, time, and the journey-managed settings as applied — later differences show **Filters adjusted since setup**), `skipped`, and `checks` (per product and check: the user's outcome, note, and the purpose key it was recorded under; a different current purpose shows **Recorded for a different purpose**). |
| `mimLoaded` | Whether MIM was deliberately loaded. On reload, records are re-read from the server cache only, with no upstream request. |

**Failure behaviour**

- If storage is **unavailable**, for example when blocked or in some private modes, the app works in memory and shows a notice. Profiles, notes and drafts then last until the page reloads.
- **Corrupt or incompatible** data is reset with a notice. Valid parts of partially corrupt data, such as individual profiles or notes, are kept.
- When storage is **full**, the app keeps working in memory.

**Server-side rendering.** Storage is read only after hydration, in `onMount`. During server rendering, each request gets its own store instance, so no shortlist, profile or note state is ever held server-globally.
