# CEOS-ARD product information review — 14 September 2026

Reviewed all 26 existing catalogue records, with emphasis on CEOS-ARD assessment level, output encoding and readily verifiable technical fields. Read the 26 linked peer-review packages (some contain multiple assessments) and their linked self-assessments, then consulted primary provider specifications. Document contents were treated as evidence, not instructions.

## Results

- Filled 16 missing assessment levels. All 26 linked peer-review outcomes explicitly confirm Threshold compliance; no overall Goal/Target level is assigned.
- Recorded output storage bit depth and data type for 15 products. The original file had only one numeric output value and mixed storage with radiometric resolution.
- Corrected Landsat Collection 2 signed INT16 wording to unsigned 16-bit science-band encoding.
- Replaced EOS-04 NRB mission-mode options 33/50 m with the 18 m MRS and 36 m CRS products explicitly named in the peer-review package; neither variant is forced as the primary value.
- Added JAXA and Digital Earth Africa DEM/projection/cadence details, PROBA-V format/projection, and OPERA DISP encoding/projection/NetCDF detail.
- Removed unsupported AIR-CAS prototype grid, revisit and bit-depth values. The generic Landsat examples embedded in its assessment template do not establish AIR-CAS product values.
- Removed ASTER GED from the Landsat ST elevation-model fields: it is an emissivity input, now identified in the retrieval description.
- Synchronised the seven legacy fallback status records with their canonical assessments, including changing AIR-CAS from the obsolete “Assessment in progress” status.

## Assessment and encoding evidence by product

Storage below refers to the identified science layer. Masks, quality bands and auxiliary layers can use different types. Source versions and limitations are recorded in the update declarations and research log.

| Product | Assessment | Verified output storage | Encoding source |
| --- | --- | --- | --- |
| ALOS-2 PALSAR-2 25m ScanSAR NRB | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.0/ALOS-2/JAXA%20PALSAR-2%2025m%20ScanSAR%20HH%20HV%20WGCV%20Eval%20for%20SAR(NRB)%20Threshold%20v1.pdf) | 16-bit uint16 (backscatter amplitude bands) | [Provider specification](https://www.eorc.jaxa.jp/ALOS/en/dataset/pdf/PALSAR2_CARD4L_L2.2_Geotiff_Format_Description_E_20220715.pdf) |
| ALOS-2 PALSAR-2 Global Mosaics (RTC) | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.0/ALOS-2/JAXA%20PALSAR-2%2025m%20FineBeam%20Global%20Mosaic%20HH%20HV%20WGCV%20Eval%20for%20SAR(NRB)%20Threshold%20v1.pdf) | 16-bit uint16 (HH/HV backscatter amplitude bands) | [Provider specification](https://www.eorc.jaxa.jp/ALOS/en/dataset/pdf/DatasetDescription_PALSAR2_Mosaic_ver212.pdf) |
| Catalyst Sentinel-1 RTC | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.1/Catalyst%20Sentinel1A%2010m%20VVVH%20WGCV%20Eval%20for%20SAR%28NRB%29%20Threshold%20v1.1.pdf) | Unknown | Not established in this review |
| Catalyst SPOT 5 HRG 2.5m | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/SR/v5.0.1/Catalyst-SPOT5-HRG/WGCV%20Assessment%20-%20Catalyst%20SPOT%205%20SR%20v5.pdf) | Unknown | Not established in this review |
| Constellr LSTprecision | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/ST/v5.0/Constellr%20LSTprecision%20-%20CEOS%20ARD%20Review%20Summary.pdf) | 16-bit uint16 (surface-temperature layer) | [Provider specification](https://constellr.github.io/product-lst/LST-precision-metadata/) |
| DESIS L2A | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/SR/v5.0.1/DESIS%20HSI%20L2A/WGCV%20Assessment%20DLR%20DESIS%20HSI%20v501%20MT.pdf) | 16-bit int16 (surface-reflectance cube) | [Provider specification](https://www.dlr.de/de/eoc/forschung-transfer/projekte-und-missionen/desis/products/pav-dlr-tn-004.pdf/@@download/file) |
| EarthDaily Constellation | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/SR/v5.0.1/EDC-SR/EarthDaily%20-%20CEOS%20ARD%20Peer%20Review%20Summary.pdf) | 16-bit uint16 (L2A reflectance image bands) | [Provider specification](https://earthdaily.com/hubfs/NGEOS%20PDFs/Next%20Generation%20EO%20Forum%20-%20EDC%20DATA%20PRODUCTS.pdf?hsLang=en) |
| EnMAP | [Threshold](https://ceos.org/ard/files/Self%20Assessments/SR/v5.0/WGCV_CARD4L_Assessment_for_DLR_EnMAP_SR_Threshold_v5.pdf) | 16-bit int16 (L2A surface-reflectance spectral images) | [Provider specification](https://www.enmap.org/data/test_data/EN-PCV-ICD-2009-2_HSI_Product_Specification_Level1_Level2_v1.5_excerpt_draft_public.pdf) |
| L8 SR (Aerospace Information Research Institute) | [Threshold](https://ceos.org/ard/files/Self%20Assessments/SR/v5.0/WGCV%20Assessment%20-%20AIRCAS%20Landsat8%20SR%20v5.pdf) | Unknown | Not established in this review |
| L8 ST (Aerospace Information Research Institute) | [Threshold](https://ceos.org/ard/files/Self%20Assessments/ST/v5.0/WGCV%20Assessment%20-%20AIRCAS%20Landsat8%20ST%20v5.pdf) | Unknown | Not established in this review |
| Landsat Collection 2 Surface Reflectance | [Threshold](https://ceos.org/ard/files/Self%20Assessments/SR/v5.0/WGCV_CARD4L_Review_Panel_Assessment_USGS_SR_PFS_v5.pdf) | 16-bit uint16 (SR/ST science bands) | [Provider specification](https://www.usgs.gov/faqs/how-do-i-use-a-scale-factor-landsat-level-2-science-products) |
| Landsat Collection 2 Surface Temperature | [Threshold](https://ceos.org/ard/files/Self%20Assessments/ST/v5.0/WGCV_CARD4L_Review_Panel_Assessment_for_USGS_ST_PFS_v5.pdf) | 16-bit uint16 (SR/ST science bands) | [Provider specification](https://www.usgs.gov/faqs/how-do-i-use-a-scale-factor-landsat-level-2-science-products) |
| Landsat Collection 2 U.S. ARD Surface Reflectance | [Threshold](https://ceos.org/ard/files/Self%20Assessments/SR/v5.0/WGCV_CARD4L_Assessment_for_USGS_Surface_Reflectance-v5.0_Landsat_C2_US_ARD.pdf) | 16-bit uint16 (SR/ST science bands) | [Provider specification](https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products) |
| Landsat Collection 2 U.S. ARD Surface Temperature | [Threshold](https://ceos.org/ard/files/Self%20Assessments/ST/v5.0/WGCV_CARD4L_Assessment_for_USGS_Surface_Temperature-v5.0_Landsat_C2_US_ARD.pdf) | 16-bit uint16 (SR/ST science bands) | [Provider specification](https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products) |
| NovaSAR-1 RTC | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/NRB/v5.5/NovaSAR_WGCVEval.zip) | Unknown | Not established in this review |
| NRCan RCM NRB | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.1/NRCan%20RCM/RCM%2016m%20StripMap%20NRB%20WGCV%20Eval%20for%20SAR(NRB)%20Threshold%20v1.1.pdf) | Unknown | Not established in this review |
| NRCan RCM POL | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.1/NRCan%20RCM/RCM%2030m%20ScanSAR%20NRB%20POL%20WGCV%20Eval%20for%20SAR(NRB%20POL)%20Threshold%20v1.1.pdf) | Unknown | Not established in this review |
| OPERA RTC Sentinel-1 | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/NRB/v5.5/Opera%20RTC%20Sentinel-1%20peer%20review.zip) | 32-bit float32 (polarisation backscatter imagery) | [Provider specification](https://d2pn8kiwq2w21t.cloudfront.net/documents/ProductSpec_RTC_FXo4L08.pdf) |
| PROBA-V L3 0.1/0.333/1 km TOC | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/SR/v5.0/PROBA-V%20Assessment%20for%20SR%20S5TOC%20Threshold%20v5.pdf) | 16-bit integer (signedness not specified) (HDF5 TOC reflectance bands) | [Provider specification](https://proba-v.vgt.vito.be/sites/probavvgt/files/downloads/PROBA-V_C2_Products_User_Manual.pdf) |
| RISAT-1A EOS-04 NRB | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.0/ISRO_EOS04_SAR_v1.0_WGCV_Assessment.zip) | Unknown | Not established in this review |
| RISAT-1A EOS-04 NRB India Mosaic | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.1/EOS04%2018m%20MRS%20ScanSAR%20HH%20HV%20Mosaic%20WGCV%20Eval%20for%20SAR(NRB)%20Threshold%20v1.1.pdf) | Unknown | Not established in this review |
| Sentinel-1 NRB (Geoscience Australia) | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.2/S1-NRB-GA/Sentinel-1%20NRB%20%28Geoscience%20Australia%29%20-%20CEOS%20ARD%20Peer%20Review%20Summary%20.pdf) | Unknown | Not established in this review |
| Sentinel-1 OPERA InSAR Surface Displacement | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.2/S1-OPERA-INSAR/OPERA%20DISP%20InSAR%20-%20CEOS%20ARD%20Review%20Summary.pdf) | 32-bit float32 (displacement layer) | [Provider specification](https://d2pn8kiwq2w21t.cloudfront.net/documents/OPERA_DISP_S1_Final_Product_Spec.pdf) |
| Sentinel-1 RTC (Digital Earth Africa) | [Threshold](https://ceos.org/ard/files/Self%20Assessments/NRB/v5.5/WGCV_CARD4L_Assessment_for_Sinergise_Sentinel-1_NRB_v5.5.pdf) | 32-bit float32 (VV/VH backscatter bands) | [Provider specification](https://docs.digitalearthafrica.org/en/latest/data_specs/Sentinel-1_specs.html) |
| Sentinel-2 Level-2A | [Threshold](https://ceos.org/ard/files/Self%20Assessments/SR/v5.0/WGCV_CARD4L_Evaluation_for_ESA-S2_SR_at_Threshold_PFS_v5.pdf) | 16-bit uint16 (reflectance imagery) | [Provider specification](https://sentiwiki.copernicus.eu/web/s2-mission) |
| Synspective StriX Series NRB | [Threshold](https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.2/SynspectiveStrixNRB/Synspective%20NRB%20SAR%20-%20CEOS%20ARD%20Review%20Summary.pdf) | Unknown | Not established in this review |

## Meaning of bit depth

`output_storage_bit_depth`, `output_data_type` and `output_storage_display` describe delivered files. `radiometric_bit_depth` is reserved for evidence about radiometric resolution. No verified product-level radiometric-resolution value was established here, so that numeric field remains null. The app displays output storage in cards, details and comparisons; it does not use storage width to pass a radiometric screening requirement.

For example, Copernicus distinguishes 12-bit MSI acquisition from 16-bit product storage. Float32 radar output is likewise not a claim of 32-bit sensor quantisation. [Copernicus SentiWiki](https://sentiwiki.copernicus.eu/web/s2-mission)

## Remaining work and scope limits

Output encoding remains unresolved for 11 products: Catalyst Sentinel-1 RTC, Catalyst SPOT 5 HRG 2.5m, L8 SR (Aerospace Information Research Institute), L8 ST (Aerospace Information Research Institute), NovaSAR-1 RTC, NRCan RCM NRB, NRCan RCM POL, RISAT-1A EOS-04 NRB, RISAT-1A EOS-04 NRB India Mosaic, Sentinel-1 NRB (Geoscience Australia), Synspective StriX Series NRB. These records remain null. Consult an identified assessed sample or a product/version-specific specification; general software capabilities and generic PFS examples are insufficient.

PROBA-V Table 39 says 16-bit integer without specifying signedness, so signedness is left unspecified. EnMAP encoding is supported by its explicitly dated draft product specification and corroborated by a current DLR L2A item; this does not establish all future processor versions. DESIS encoding changed in older processor versions. EarthDaily and Constellr current specifications do not independently expand the scope of their older CEOS assessments.

The public CEOS landing page was checked, but its embedded Airtable register was not freshly enumerated. Approval dates, assessment PFS versions and the 26-record inventory remain from the earlier catalogue. The linked peer-review outcomes were directly rechecked; the latest available PFS is not substituted for the version actually assessed.

This is not a complete revalidation of every pre-existing value. Unchanged fields retain their earlier check dates. Scalar accuracy and many coverage/cadence/DEM details still need product-specific research. The manual-review CSV retains outstanding version and product-scope issues.

## Traceability and validation

- `data/ceos_ard_verified_updates.json`: source, scope, values and review date for every correction or unresolved encoding lookup.
- `data/ceos_ard_research_log.csv`: field-level provenance with original dates preserved for unchanged fields.
- `reports/ceos_ard_changes_2026-09-14.csv`: before/after values and supporting source for changed fields.
- `tools/populate_ceos_ard.py`: reproducibly applies the reviewed declarations and regenerates catalogue, provenance and fallback status.
- Validation: 86 existing/regression tests passed, including a check that storage width cannot satisfy a radiometric-resolution requirement. Catalogue loading and deterministic regeneration checked.
