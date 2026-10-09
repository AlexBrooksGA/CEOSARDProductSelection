# Purpose journey visual assets

`earth-observation-states-concept.png` is the supplied visual reference and source image for the guided entry experience.

Absolute path:

`C:\Users\Alexander\Documents\product selection\assets\design\purpose-journey\earth-observation-states-concept.png`

The image is 2007 × 783 pixels. It is one concept board containing six imagery panels, not six separately delivered files:

| Position | Treatment |
| --- | --- |
| Top left | Optical / surface-reflectance-inspired, finer detail |
| Top centre | Synthetic-aperture-radar-inspired, finer detail |
| Top right | Surface-temperature-inspired, finer detail |
| Bottom left | Optical, coarser detail |
| Bottom centre | Radar-inspired, coarser detail |
| Bottom right | Thermal-inspired, coarser detail |

Created using the built-in image-generation tool on 9 October 2026. This is AI-generated imagery of a fictional landscape, not observations, measured quality evidence, a physically modelled sensor simulation, or a depiction of a particular product or location. The panels are approximately aligned artistic variants; they are not registered scientific imagery. Finer and coarser detail do not represent calibrated metre-scale resolutions.

## Implementation use

Read `reports/CLAUDE_CODE_PURPOSE_JOURNEY_ADDON_PROMPT.md` for the implementation brief.

Use ordinary local image-processing tools to extract the six imagery panels into separate background assets. No image-generation capability or external image service is required. Preserve this source board. Exclude its headings, row labels, footer and gutters from the extracted assets. Visually verify the crops. Suggested output names under `static/images/purpose-journey/`:

- `optical-fine.webp`
- `optical-coarse.webp`
- `radar-fine.webp`
- `radar-coarse.webp`
- `thermal-fine.webp`
- `thermal-coarse.webp`

These output files do not exist yet; Claude should create them during implementation. The source panels are approximately 600 × 335 pixels: use them as atmospheric backgrounds under gradients, not as sharp full-screen scientific imagery. Do not claim an upscaled derivative contains additional real spatial detail. Optimise file sizes and inspect at actual display sizes.

Render explanatory labels, form text and controls as accessible HTML. Keep a small visible “Illustrative imagery” label with an accessible explanation of its fictional origin. Do not serve the whole board as the hero or reveal labels from neighbouring panels during transitions.

Use a dark navy gradient to protect text contrast, restrained cyan/teal accents, and gentle crossfades. Do not add artificial scan lines, spacecraft, floating dashboards or decorative scientific readings. Respect reduced-motion preferences and provide a plain gradient fallback if assets fail to load.

The imagery was prepared for design and implementation handoff only. Saving this asset has not changed the running application.
