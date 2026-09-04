# CEOS-ARD catalogue population summary

Checked: 2026-07-12

## Outcome

- Supplied assessments: **26**
- Added as canonical researched catalogue records: **26**
- Existing demo records matched: **7 of 7** (consolidated into 5 canonical assessment records)
- Existing values silently overwritten: **0**
- Manual-review issues: **7**
- Products with an explicitly confirmed overall tier: **10**
- Products with confirmed product-level primary spatial resolution: **19**
- Products with confirmed product-level revisit or update information: **5**
- Products with confirmed output-product bit-depth information: **1**
- Products with geometric accuracy information: **2**
- Products with radiometric/temperature accuracy information: **1**

## Existing-record matching and duplicate handling

The application now loads the 26 canonical official assessments rather than appending them to the seven demo cards. Landsat 8/9 Collection 2 cards map to the official multi-mission Landsat Collection 2 SR assessment; the two Landsat 8/9 U.S. ARD cards map to the official multi-mission U.S. ARD SR assessment. Sentinel-2, EarthDaily, and AIR-CAS each map to an official record. Matching demo IDs are retained in `existing_demo_record_ids`. The two official Landsat temperature assessments are new because the demo contained only SR variants.

The original demo's defensible Landsat, Sentinel-2 and EarthDaily values were replaced by more precise official product documentation. AIR-CAS values that could not be product-confirmed remain visibly marked as mission/instrument-level or ambiguous; unsupported processing fields were not promoted into the canonical record.

## Commonly unavailable fields

Overall ARD tier, output radiometric bit depth, scalar geometric accuracy, scalar radiometric accuracy, product-specific revisit/update frequency, and exact DEM/grid details were most often unavailable in concise public product documentation. Missing values remain null. Storage types such as INT16/UInt16 are described but are not automatically treated as radiometric resolution.

## Important conflicts and cautions

- PROBA-V's official CEOS name uses 0.333 km while the current provider page says 300 m.
- EOS-04 documentation uses different concepts/numbers for MRS resolution and pixel dimensions; no single filter value is forced.
- Mission revisit is retained only with a mission/constellation basis and is not described as product latency.
- Mosaics use update frequency (annual for JAXA) instead of mission revisit.
- Commercial/tasked products are not labelled global merely because their missions can acquire worldwide.

## API use

No MIM fields were used. `MIMS_API_BASE_URL`, `MIMS_API_USERNAME`, and `MIMS_API_PASSWORD` were not configured on the check date. The existing cached, opt-in MIM adapter remains unchanged and the catalogue operates offline.

## Authoritative sources consulted

The live CEOS Analysis-Ready Datasets register was used for every assessment's official status, PFS type/version, organisation, mission/instrument links, approval date, and assessment-package URLs. Product details were supplemented from JAXA EORC, USGS Landsat, ESA/Copernicus SentiWiki, NASA/JPL OPERA, DLR/EnMAP/DESIS, VITO PROBA-V, NRCan/CSA, NRSC/Bhoonidhi, CSIRO, Digital Earth Africa, Constellr, EarthDaily, Catalyst, and Synspective primary documentation. Every researched field, including failed lookups, is represented in `data/ceos_ard_research_log.csv`.
