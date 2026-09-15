"""Build the researched CEOS-ARD catalogue and its provenance reports.

The compact source declarations below are intentionally reviewable. Generated JSON/CSV
files are deterministic and can be rebuilt without network access.
"""

from __future__ import annotations

import csv
import json
from datetime import date, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
REPORTS = ROOT / "reports"
CHECKED = date(2026, 7, 12).isoformat()
REGISTER = "https://ceos.org/ard/"
APPROVED_REVIEW = REPORTS / "ceos_ard_changes_2026-09-14.csv"


def item(identifier, name, pfs, version, agency, missions, approved, *, access=None,
         info=None, self_assessment=None, peer=None, sample=None, instruments=None,
         demo_ids=None):
    family = "Synthetic Aperture Radar" if ("SAR" in pfs or pfs == "NRB") else pfs
    return {
        "id": identifier,
        "official_product_name": name,
        "display_name": name,
        "product_name": name,
        "ceos_ard_assessment_id": f"ceos-ard:{identifier}",
        "ceos_ard_status": "CEOS-ARD",
        "ceos_ard_verified": True,
        "ard_tier": None,
        "ard_tier_display": None,
        "ard_tier_notes": "No overall tier is recorded unless an official assessment document states it explicitly.",
        "pfs_type": pfs,
        "pfs_version": version,
        "ceos_ard_pfs": f"{pfs} {version}",
        "ceos_ard_assessment_level": None,
        "approval_date": approved,
        "agency": agency,
        "provider": agency,
        "missions": missions,
        "mission_name": ", ".join(missions),
        "instruments": instruments or [],
        "family": missions[0].split("-")[0] if missions else "Other",
        "product_family": family,
        "spatial_resolution_m": None,
        "spatial_resolution_options_m": [],
        "spatial_resolution_display": None,
        "spatial_resolution_basis": "unknown",
        "nominal_revisit_days": None,
        "nominal_revisit_display": None,
        "revisit_days": None,
        "revisit_display": None,
        "revisit_basis": "unknown",
        "product_update_frequency_days": None,
        "product_update_frequency_display": None,
        "geographic_coverage": "Unknown",
        "geographic_coverage_display": None,
        "coverage_basis": "unknown",
        "radiometric_bit_depth": None,
        "radiometric_bit_depth_display": None,
        "bit_depth_basis": "unknown",
        "output_storage_bit_depth": None,
        "output_storage_display": None,
        "output_data_type": None,
        "geometric_accuracy_display": None,
        "geometric_accuracy_metric": None,
        "geometric_accuracy_value": None,
        "geometric_accuracy_unit": None,
        "radiometric_accuracy_display": None,
        "radiometric_accuracy_metric": None,
        "radiometric_accuracy_value": None,
        "radiometric_accuracy_unit": None,
        "operational_status": None,
        "swath_width": None,
        "atmospheric_correction": None,
        "elevation_model": None,
        "coordinate_system": None,
        "data_format": None,
        "access_url": access,
        "information_url": info,
        "self_assessment_url": self_assessment,
        "peer_review_url": peer,
        "sample_product_url": sample,
        "ceos_ard_record_url": REGISTER,
        "source_type": "curated_ceos_ard",
        "source_url": REGISTER,
        "existing_demo_record_ids": demo_ids or [],
        "notes": "Values are product-level unless a basis field or note explicitly says mission/instrument-level or ambiguous.",
    }


P = [
item("alos2-palsar2-25m-scansar-nrb", "ALOS-2 PALSAR-2 25m ScanSAR NRB", "SAR-NRB", "v1.0", "JAXA", ["ALOS-2"], "2024-04-17", instruments=["PALSAR-2"], access="https://developers.google.com/earth-engine/datasets/catalog/JAXA_ALOS_PALSAR-2_Level2_2_ScanSAR", info="https://www.eorc.jaxa.jp/ALOS/en/dataset/palsar2_l22_e.htm", self_assessment="https://ceos.org/ard/files/Self%20Assessments/SAR/v1.0/ALOS-2/JAXA_PALSAR-2_Self-assessment_CEOS-ARD4SAR-PFS_v1.0_NRB_20240404.docx", peer="https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.0/ALOS-2/JAXA%20PALSAR-2%2025m%20ScanSAR%20HH%20HV%20WGCV%20Eval%20for%20SAR(NRB)%20Threshold%20v1.pdf", sample="https://www.eorc.jaxa.jp/ALOS/en/alos-2/datause/ceos-ard-sample/ALOS2_PALSAR2_ScanSAR_L2.2_sample.zip"),
item("alos2-palsar2-global-mosaics-rtc", "ALOS-2 PALSAR-2 Global Mosaics (RTC)", "SAR-NRB", "v1.0", "JAXA", ["ALOS-2"], "2024-04-17", instruments=["PALSAR-2"], access="https://www.eorc.jaxa.jp/ALOS/en/dataset/fnf_e.htm", info="https://www.eorc.jaxa.jp/ALOS/en/dataset/pdf/DatasetDescription_PALSAR2_Mosaic_ver212.pdf", self_assessment="https://ceos.org/ard/files/Self%20Assessments/SAR/v1.0/ALOS-2/JAXA_PALSAR-2_Self-assessment_CEOS-ARD4SAR-PFS_v1.0_NRB_20240404.docx", peer="https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.0/ALOS-2/JAXA%20PALSAR-2%2025m%20FineBeam%20Global%20Mosaic%20HH%20HV%20WGCV%20Eval%20for%20SAR(NRB)%20Threshold%20v1.pdf", sample="https://www.eorc.jaxa.jp/ALOS/en/alos-2/datause/ceos-ard-sample/ALOS2_PALSAR2_25m-GlobalMosaic_QP_sample.zip"),
item("catalyst-sentinel1-rtc", "Catalyst Sentinel-1 RTC", "SAR-NRB", "v1.1", "Catalyst/PCI", ["Sentinel-1A", "Sentinel-1B", "Sentinel-1C", "Sentinel-1D"], "2024-10-17", access="https://catalyst.earth/earth-observation-science/analysis-ready-data/", info="https://catalyst.earth/earth-observation-science/analysis-ready-data/", self_assessment="https://ceos.org/ard/files/Self%20Assessments/SAR/v1.1/Catalyst-S1/CEOS-ARD_PFS_SAR_v1.1_CATALYST_Official_Submission.docx", peer="https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.1/Catalyst%20Sentinel1A%2010m%20VVVH%20WGCV%20Eval%20for%20SAR%28NRB%29%20Threshold%20v1.1.pdf", sample="https://pcigeomatics.sharepoint.com/:f:/s/CATALYST-CEOS/ElsdJawQ1HdOmd9pRtfjvCsBmLwy2gUM9v5SxAnIfXefuA?e=MVO6Mu"),
item("catalyst-spot5-hrg-2-5m", "Catalyst SPOT 5 HRG 2.5m", "Surface Reflectance", "v5.0.1", "Catalyst/PCI", ["SPOT-5"], "2024-12-04", instruments=["HRG"], access="https://catalyst.earth/earth-observation-science/analysis-ready-data/", info="https://catalyst.earth/earth-observation-science/analysis-ready-data/", self_assessment="https://ceos.org/ard/files/Self%20Assessments/SR/v5.0.1/CatalystSPOT-5/CEOS-ARD_Product_Family_Specification_Surface_Reflectance-v5.0.1_CATALYST_SPOT5.docx", peer="https://ceos.org/ard/files/Peer%20Reviews/SR/v5.0.1/Catalyst-SPOT5-HRG/WGCV%20Assessment%20-%20Catalyst%20SPOT%205%20SR%20v5.pdf", sample="https://pcigeomatics.sharepoint.com/:f:/s/CATALYST-CEOS/Ev0YSJ44p0xGpLrnZLYaZ_YBvFE_ZvQN37Dbqd8gKlWEYQ?e=7bImxQ"),
item("constellr-lstprecision", "Constellr LSTprecision", "Surface Temperature", "v5.0", "Constellr", ["SkyBee A01", "SkyBee A02"], "2026-05-19", access="https://constellr.github.io/product-lst/UI-documentation/", info="https://constellr.github.io/product-lst/LST-precision/", self_assessment="http://ceos.org/ard/files/Self%20Assessments/ST/v5.0/CEOS-ARD_Product_Family_Specification_Surface_Temperature-v5.0_constellr%20-%20Peer%20Review.pdf", peer="http://ceos.org/ard/files/Peer%20Reviews/ST/v5.0/Constellr%20LSTprecision%20-%20CEOS%20ARD%20Review%20Summary.pdf", sample="https://constellr.github.io/product-lst/example-datasets/"),
item("desis-l2a", "DESIS L2A", "Surface Reflectance", "v5.0.1", "DLR", ["ISS"], "2025-02-12", instruments=["DESIS"], access="https://geoservice.dlr.de/web/datasets/desis_l2_hsi", info="https://www.dlr.de/en/eoc/research-transfer/projects-missions/desis", self_assessment="https://ceos.org/ard/files/Self%20Assessments/SR/v5.0.1/DESIS%20HSI%20L2A/20250204__DESIS__CEOS-ARD_Product_Family_Specification_Surface_Reflectance-v5.0.1_SelfAssessment.docx", peer="https://ceos.org/ard/files/Peer%20Reviews/SR/v5.0.1/DESIS%20HSI%20L2A/WGCV%20Assessment%20DLR%20DESIS%20HSI%20v501%20MT.pdf", sample="https://www.dlr.de/en/eoc/research-transfer/projects-missions/desis/products/example-l2a-data"),
item("earthdaily-constellation", "EarthDaily Constellation", "Surface Reflectance", "v5.0.1", "EarthDaily", ["EarthDaily Constellation"], "2025-10-07", info="https://earthdaily.com/earthdaily-constellation-science-quality-data", self_assessment="http://ceos.org/ard/files/Self%20Assessments/SR/v5.0.1/EDC-SR/EarthDaily%20-%20CEOS-ARD_Product_Family_Specification_Surface_Reflectance-v5.0.1%20-%20Peer%20Review.pdf", peer="http://ceos.org/ard/files/Peer%20Reviews/SR/v5.0.1/EDC-SR/EarthDaily%20-%20CEOS%20ARD%20Peer%20Review%20Summary.pdf", demo_ids=["earthdaily-constellation"]),
item("enmap-l2a", "EnMAP", "Surface Reflectance", "v5.0", "DLR", ["EnMAP"], "2022-01-22", instruments=["HSI"], access="https://www.enmap.org/data_access/", info="https://www.enmap.org/", self_assessment="https://ceos.org/ard/files/Self%20Assessments/SR/v5.0/Response_Review_comments_EnMAP_CARD4L_Product_Family_Specification_Surface_Reflectance-v5.pdf", peer="https://ceos.org/ard/files/Self%20Assessments/SR/v5.0/WGCV_CARD4L_Assessment_for_DLR_EnMAP_SR_Threshold_v5.pdf", sample="https://www.enmap.org/data_tools/exampledata/"),
item("aircas-l8-sr", "L8 SR (Aerospace Information Research Institute)", "Surface Reflectance", "v5.0", "AIR-CAS", ["Landsat-8"], "2023-12-06", access="https://doi.org/10.12237/casearth.RTU_Data_303", info="https://doi.org/10.12237/casearth.RTU_Data_303", self_assessment="https://ceos.org/ard/files/Self%20Assessments/SR/v5.0/AIRCAS_PFS_Self%20Assessment%20Surface_Reflectance-v5.0.pdf", peer="https://ceos.org/ard/files/Self%20Assessments/SR/v5.0/WGCV%20Assessment%20-%20AIRCAS%20Landsat8%20SR%20v5.pdf", sample="https://drive.google.com/file/d/1LZwW1z9PEzBEXaUpHfHfhveyZNoZFFWh/view?usp=drive_link", demo_ids=["landsat-8-aircas"]),
item("aircas-l8-st", "L8 ST (Aerospace Information Research Institute)", "Surface Temperature", "v5.0", "AIR-CAS", ["Landsat-8"], "2023-12-06", access="https://doi.org/10.12237/casearth.RTU_Data_302", info="https://doi.org/10.12237/casearth.RTU_Data_302", self_assessment="https://ceos.org/ard/files/Self%20Assessments/ST/v5.0/AIRCAS_PFS_Self%20Assessment%20Surface_Temperature-v5.0.pdf", peer="https://ceos.org/ard/files/Self%20Assessments/ST/v5.0/WGCV%20Assessment%20-%20AIRCAS%20Landsat8%20ST%20v5.pdf", sample="https://drive.google.com/file/d/1FktCGTwQ6PW0N9katZcse5-1Zy9mQJv2/view?usp=drive_link"),
]

LANDSAT_INFO = "https://www.usgs.gov/landsat-missions/landsat-collection-2"
LANDSAT_SAMPLE = "https://www.usgs.gov/landsat-missions/landsat-sample-products"
P.extend([
item("landsat-c2-sr", "Landsat Collection 2 Surface Reflectance", "Surface Reflectance", "v5.0", "USGS", ["Landsat 4", "Landsat 5", "Landsat 7", "Landsat 8", "Landsat 9"], "2021-06-04", access="https://earthexplorer.usgs.gov/", info=LANDSAT_INFO, self_assessment="https://ceos.org/ard/files/Self%20Assessments/SR/v5.0/Assessment_CARD4L_Product_Family_Specification_Surface_Reflectance-v5.0_Collection-2_USGS_Landsat_08142020.pdf", peer="https://ceos.org/ard/files/Self%20Assessments/SR/v5.0/WGCV_CARD4L_Review_Panel_Assessment_USGS_SR_PFS_v5.pdf", sample=LANDSAT_SAMPLE, demo_ids=["landsat-8-collection-2", "landsat-9-collection-2"]),
item("landsat-c2-st", "Landsat Collection 2 Surface Temperature", "Surface Temperature", "v5.0", "USGS", ["Landsat 4", "Landsat 5", "Landsat 7", "Landsat 8", "Landsat 9"], "2021-06-04", access="https://earthexplorer.usgs.gov/", info=LANDSAT_INFO, self_assessment="https://ceos.org/ard/files/Self%20Assessments/ST/v5.0/Assessment_CARD4L_Product_Family_Specification_Surface_Temperature-v5.0_Collection-2_USGS_Landsat_08142020.pdf", peer="https://ceos.org/ard/files/Self%20Assessments/ST/v5.0/WGCV_CARD4L_Review_Panel_Assessment_for_USGS_ST_PFS_v5.pdf", sample=LANDSAT_SAMPLE),
item("landsat-c2-usard-sr", "Landsat Collection 2 U.S. ARD Surface Reflectance", "Surface Reflectance", "v5.0", "USGS", ["Landsat 4", "Landsat 5", "Landsat 7", "Landsat 8", "Landsat 9"], "2022-05-23", access="https://doi.org/10.5066/P960F8OC", info="https://www.usgs.gov/landsat-missions/landsat-collection-2-us-analysis-ready-data", self_assessment="https://ceos.org/ard/files/Self%20Assessments/SR/v5.0/CARD4L_Product_Family_Specification_Surface_Reflectance-v5.0_Landsat%20C2%20US%20ARD_20220330.pdf", peer="https://ceos.org/ard/files/Self%20Assessments/SR/v5.0/WGCV_CARD4L_Assessment_for_USGS_Surface_Reflectance-v5.0_Landsat_C2_US_ARD.pdf", sample=LANDSAT_SAMPLE, demo_ids=["landsat-8-us-ard", "landsat-9-us-ard"]),
item("landsat-c2-usard-st", "Landsat Collection 2 U.S. ARD Surface Temperature", "Surface Temperature", "v5.0", "USGS", ["Landsat 4", "Landsat 5", "Landsat 7", "Landsat 8", "Landsat 9"], "2022-05-23", access="https://doi.org/10.5066/P960F8OC", info="https://www.usgs.gov/landsat-missions/landsat-collection-2-us-analysis-ready-data", self_assessment="https://ceos.org/ard/files/Self%20Assessments/ST/v5.0/CARD4L_Product_Family_Specification_Surface_Temperature-v5.0_Landsat%20C2%20US%20ARD_20220330.pdf", peer="https://ceos.org/ard/files/Self%20Assessments/ST/v5.0/WGCV_CARD4L_Assessment_for_USGS_Surface_Temperature-v5.0_Landsat_C2_US_ARD.pdf", sample=LANDSAT_SAMPLE),
item("novasar1-rtc", "NovaSAR-1 RTC", "NRB", "v5.5", "CSIRO", ["NovaSAR-1"], "2023-10-05", access="https://data.novasar.csiro.au/#/home", info="https://research.csiro.au/cceo/novasar/", self_assessment="https://ceos.org/ard/files/Self%20Assessments/NRB/v5.5/NovaSAR_CSIRO_SelfAssessment.zip", peer="https://ceos.org/ard/files/Peer%20Reviews/NRB/v5.5/NovaSAR_WGCVEval.zip"),
item("nrcan-rcm-nrb", "NRCan RCM NRB", "SAR-NRB", "v1.1", "NRCan", ["RCM-1", "RCM-2", "RCM-3"], "2025-02-07", access="https://www.eodms-sgdot.nrcan-rncan.gc.ca/", info="https://www.asc-csa.gc.ca/eng/satellites/radarsat/", self_assessment="https://ceos.org/ard/files/Self%20Assessments/SAR/v1.1/NRCan%20RCM/CCRS_RCM_Stripmap%20NRB%20Self_Assesment_CEOS_ARD_V4_16M11.docx", peer="https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.1/NRCan%20RCM/RCM%2016m%20StripMap%20NRB%20WGCV%20Eval%20for%20SAR(NRB)%20Threshold%20v1.1.pdf"),
item("nrcan-rcm-pol", "NRCan RCM POL", "SAR-POL", "v1.1", "NRCan", ["RCM-1", "RCM-2", "RCM-3"], "2025-02-07", access="https://registry.opendata.aws/rcm-ceos-ard/", info="https://www.asc-csa.gc.ca/eng/satellites/radarsat/", self_assessment="https://ceos.org/ard/files/Self%20Assessments/SAR/v1.1/NRCan%20RCM/CCRS_RCM_ScanSAR%20NRB%20POL%20Self_Assesment_CEOS_ARD.docx", peer="https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.1/NRCan%20RCM/RCM%2030m%20ScanSAR%20NRB%20POL%20WGCV%20Eval%20for%20SAR(NRB%20POL)%20Threshold%20v1.1.pdf", sample="https://registry.opendata.aws/rcm-ceos-ard/"),
item("opera-rtc-sentinel1", "OPERA RTC Sentinel-1", "NRB", "v5.5", "NASA/JPL", ["Sentinel-1A", "Sentinel-1B", "Sentinel-1C", "Sentinel-1D"], "2024-10-22", info="https://www.jpl.nasa.gov/go/opera/products/rtc-product/", self_assessment="https://ceos.org/ard/files/Self%20Assessments/NRB/v5.5/Opera%20RTC%20Sentinel-1%20self-assessment.zip", peer="https://ceos.org/ard/files/Peer%20Reviews/NRB/v5.5/Opera%20RTC%20Sentinel-1%20peer%20review.zip"),
item("proba-v-l3-toc", "PROBA-V L3 0.1/0.333/1 km TOC", "Surface Reflectance", "v5.0", "VITO/ESA", ["PROBA-V"], "2023-03-21", access="https://proba-v.vgt.vito.be/en/product-types/c2/level-3toc", info="https://proba-v.vgt.vito.be/en", self_assessment="https://ceos.org/ard/files/Self%20Assessments/SR/v5.0/CEOS-ARD_PFS_SR-v5.0_PROBA-V_C2_SelfAssessment_20230310.pdf", peer="https://ceos.org/ard/files/Peer%20Reviews/SR/v5.0/PROBA-V%20Assessment%20for%20SR%20S5TOC%20Threshold%20v5.pdf", sample="https://proba-v.vgt.vito.be/en/product-types/c2/level-3toc"),
item("risat1a-eos04-nrb", "RISAT-1A EOS-04 NRB", "SAR-NRB", "v1.0", "ISRO", ["RISAT-1A EOS-04"], "2024-04-02", access="https://bhoonidhi.nrsc.gov.in/MetaSearch/E04_SAR_MRS_STUC00ZTD", info="https://bhoonidhi.nrsc.gov.in/MetaSearch/E04_SAR_CRS_STUC00ZTD", self_assessment="https://ceos.org/ard/files/Self%20Assessments/SAR/v1.0/EOS-04/CEOS-ARD_PFS_SAR_v1.0_SelfAssessment_08032024.docx", peer="https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.0/ISRO_EOS04_SAR_v1.0_WGCV_Assessment.zip"),
item("risat1a-eos04-india-mosaic", "RISAT-1A EOS-04 NRB India Mosaic", "SAR-NRB", "v1.1", "ISRO", ["RISAT-1A EOS-04"], "2025-01-06", access="https://bhoonidhi.nrsc.gov.in/MetaSearch/E04_SAR_MRS_FIGC00ZTD", info="https://bhoonidhi.nrsc.gov.in/MetaSearch/E04_SAR_MRS_FIGC00ZTD", self_assessment="https://ceos.org/ard/files/Self%20Assessments/SAR/v1.1/EOS-04-India-Mosaic/ISRO_EOS04_SAR_Mosaic_NRB_CEOS-ARD_PFS_v1.1_SelfAssessment_Nov24.docx", peer="https://ceos.org/ard/files/Peer%20Reviews/SAR/v1.1/EOS04%2018m%20MRS%20ScanSAR%20HH%20HV%20Mosaic%20WGCV%20Eval%20for%20SAR(NRB)%20Threshold%20v1.1.pdf", sample="https://bhoonidhi.nrsc.gov.in/MetaSearch/E04_SAR_MRS_FIGC00ZTD"),
item("ga-sentinel1-nrb", "Sentinel-1 NRB (Geoscience Australia)", "SAR-NRB", "v1.2", "Geoscience Australia", ["Sentinel-1A", "Sentinel-1B", "Sentinel-1C", "Sentinel-1D"], "2025-09-23", self_assessment="http://ceos.org/ard/files/Self%20Assessments/SAR/v1.2/S1-NRB-GA/Sentinel-1%20NRB%20%28Geoscience%20Australia%29%20-%20CEOS-ARD_PFS_Synthetic_Aperture_Radar_v1.2%20-%20Peer%20Review.pdf", peer="http://ceos.org/ard/files/Peer%20Reviews/SAR/v1.2/S1-NRB-GA/Sentinel-1%20NRB%20%28Geoscience%20Australia%29%20-%20CEOS%20ARD%20Peer%20Review%20Summary%20.pdf", sample="https://deant-data-public-dev.s3.ap-southeast-2.amazonaws.com/persistent/CEOS-ARD/reviews/example_2/ga_s1a_nrb_0-1-0_T045-095837-IW1_20201129T192619Z.zip"),
item("opera-disp-sentinel1", "Sentinel-1 OPERA InSAR Surface Displacement", "SAR-INSAR", "v1.2", "NASA/JPL", ["Sentinel-1A", "Sentinel-1B", "Sentinel-1C", "Sentinel-1D"], "2026-01-05", info="https://www.jpl.nasa.gov/go/opera/products/disp-product-suite/", self_assessment="http://ceos.org/ard/files/Peer%20Reviews/SAR/v1.2/S1-OPERA-INSAR/CEOS-ARD_PFS_Synthetic_Aperture_Radar_v1.2_OPERA_DISP%20-%20Peer%20Review.pdf", peer="http://ceos.org/ard/files/Peer%20Reviews/SAR/v1.2/S1-OPERA-INSAR/OPERA%20DISP%20InSAR%20-%20CEOS%20ARD%20Review%20Summary.pdf"),
item("dea-sentinel1-rtc", "Sentinel-1 RTC (Digital Earth Africa)", "NRB", "v5.5", "Sinergise and Digital Earth Africa", ["Sentinel-1A", "Sentinel-1B", "Sentinel-1C", "Sentinel-1D"], "2022-05-20", access="https://apps.sentinel-hub.com/s1-card4l/", info="https://docs.sentinel-hub.com/api/latest/data/sentinel-1-grd/#processing-chain", self_assessment="https://ceos.org/ard/files/Self%20Assessments/NRB/v5.5/Sinergise_CARD4L-Self-Assessment_NRB_v5.5.pdf", peer="https://ceos.org/ard/files/Self%20Assessments/NRB/v5.5/WGCV_CARD4L_Assessment_for_Sinergise_Sentinel-1_NRB_v5.5.pdf", sample="https://maps.digitalearth.africa/#share=s-yVS8De2juWurmQvlef5JKNdHzMU"),
item("sentinel2-level2a", "Sentinel-2 Level-2A", "Surface Reflectance", "v5.0", "ESA", ["Sentinel-2A", "Sentinel-2B"], "2022-01-22", instruments=["MSI"], access="https://dataspace.copernicus.eu/", info="https://sentiwiki.copernicus.eu/web/s2-products#S2Products-L2AS2-Products-L2Atrue", self_assessment="https://ceos.org/ard/files/Self%20Assessments/SR/v5.0/CARD4L_Product_Family_Specification_Surface_Reflectance-v5.0_S2_SelfAssessment_20211124.pdf", peer="https://ceos.org/ard/files/Self%20Assessments/SR/v5.0/WGCV_CARD4L_Evaluation_for_ESA-S2_SR_at_Threshold_PFS_v5.pdf", sample="https://dataspace.copernicus.eu/", demo_ids=["sentinel-2-esa"]),
item("synspective-strix-nrb", "Synspective StriX Series NRB", "SAR-NRB", "v1.2", "Synspective", ["StriX Series"], "2026-05-04", info="https://synspective.com/data/synspective-sar-data/", self_assessment="http://ceos.org/ard/files/Peer%20Reviews/SAR/v1.2/SynspectiveStrixNRB/CEOS-ARD_PFS_SAR_v1.2_Synspective_Submission_Peer_Review.pdf", peer="http://ceos.org/ard/files/Peer%20Reviews/SAR/v1.2/SynspectiveStrixNRB/Synspective%20NRB%20SAR%20-%20CEOS%20ARD%20Review%20Summary.pdf"),
])

BY_ID = {p["id"]: p for p in P}
FIELD_PROVENANCE = {}
FIELD_CHECKED = {}
REVIEW_CONFLICTS = []


def enrich(identifier, source_title, source_url, confidence="confirmed_product_level",
           evidence="provider_product_documentation", **values):
    BY_ID[identifier].update(values)
    for field, value in values.items():
        if value not in (None, [], "", "Unknown", "unknown"):
            FIELD_PROVENANCE[(identifier, field)] = (source_title, source_url, evidence, confidence, "")


def tier(identifier, value="Threshold"):
    p = BY_ID[identifier]
    p.update(ard_tier=value, ard_tier_display=value, ceos_ard_assessment_level=value,
             ard_tier_notes="The linked official peer-review assessment explicitly identifies this level.")
    FIELD_PROVENANCE[(identifier, "ard_tier")] = ("Official CEOS-ARD peer-review assessment", p["peer_review_url"], "peer_review_summary", "confirmed_product_level", "Tier stated in the linked assessment title or document.")


def _review_value(raw):
    """Decode the JSON-encoded before/after cells in the review CSV."""
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def apply_approved_review_changes():
    """Apply only non-empty rows from the user-edited review document.

    Empty rows are intentional removals from the approval list and are ignored.
    The CSV before value is checked against the generated catalogue so stale
    approvals are visible in the generated summary/provenance.
    """
    if not APPROVED_REVIEW.exists():
        return
    with APPROVED_REVIEW.open(newline="", encoding="utf-8-sig") as handle:
        for row_number, row in enumerate(csv.DictReader(handle), start=2):
            if not any((value or "").strip() for value in row.values()):
                continue
            identifier = (row.get("product_id") or "").strip()
            field = (row.get("field") or "").strip()
            if not identifier or not field:
                continue
            if identifier not in BY_ID:
                REVIEW_CONFLICTS.append(f"row {row_number}: unknown product {identifier}")
                continue
            before = _review_value(row.get("before"))
            after = _review_value(row.get("after"))
            current = BY_ID[identifier].get(field)
            if current != before:
                REVIEW_CONFLICTS.append(
                    f"row {row_number}: {identifier}.{field} expected {before!r}, found {current!r}"
                )
            BY_ID[identifier][field] = after
            checked = row.get("date_checked") or ""
            try:
                checked = datetime.strptime(checked, "%d/%m/%Y").date().isoformat()
            except ValueError:
                checked = CHECKED
            FIELD_CHECKED[(identifier, field)] = checked
            FIELD_PROVENANCE[(identifier, field)] = (
                "User-approved CEOS-ARD change review",
                row.get("source_url") or BY_ID[identifier].get("information_url") or REGISTER,
                "approved_review_document",
                "confirmed_product_level",
                f"Applied from non-empty row {row_number}; blank rows were excluded.",
            )


for identifier in ["alos2-palsar2-25m-scansar-nrb", "alos2-palsar2-global-mosaics-rtc", "catalyst-sentinel1-rtc", "enmap-l2a", "novasar1-rtc", "nrcan-rcm-nrb", "nrcan-rcm-pol", "proba-v-l3-toc", "risat1a-eos04-india-mosaic", "sentinel2-level2a"]:
    tier(identifier)

enrich("alos2-palsar2-25m-scansar-nrb", "JAXA PALSAR-2 ScanSAR NRB product page", "https://www.eorc.jaxa.jp/ALOS/en/dataset/palsar2_l22_e.htm", spatial_resolution_m=25, spatial_resolution_options_m=[25, 50], spatial_resolution_display="25 m (a separate 50 m peer-review variant is also linked)", spatial_resolution_basis="product", data_format="GeoTIFF", atmospheric_correction="Not applicable (SAR); radiometric terrain correction applied", swath_width="350 km (instrument/mode-level)")
enrich("alos2-palsar2-global-mosaics-rtc", "JAXA Global PALSAR-2/PALSAR mosaics", "https://www.eorc.jaxa.jp/ALOS/en/dataset/fnf_e.htm", spatial_resolution_m=25, spatial_resolution_options_m=[25], spatial_resolution_display="0.8 arc-seconds (about 25 m at the Equator) pixel spacing", spatial_resolution_basis="product", product_update_frequency_days=365, product_update_frequency_display="Annual mosaic", geographic_coverage="Global", geographic_coverage_display="Annual global land mosaic", coverage_basis="product", coordinate_system="Geographic latitude/longitude", data_format="Cloud Optimized GeoTIFF + XML", atmospheric_correction="Not applicable (SAR); RTC/radiometric slope correction", operational_status="Active archive; annual releases")
enrich("catalyst-sentinel1-rtc", "Official CEOS peer-review assessment", BY_ID["catalyst-sentinel1-rtc"]["peer_review_url"], evidence="peer_review_summary", spatial_resolution_m=10, spatial_resolution_options_m=[10], spatial_resolution_display="10 m", spatial_resolution_basis="product", atmospheric_correction="Not applicable (SAR); radiometric terrain correction")
enrich("catalyst-spot5-hrg-2-5m", "Official assessed product name and Catalyst ARD workflow", "https://catalyst.earth/earth-observation-science/analysis-ready-data/", spatial_resolution_m=2.5, spatial_resolution_options_m=[2.5], spatial_resolution_display="2.5 m pansharpened product", spatial_resolution_basis="product", atmospheric_correction="CATALYST physical-model surface-reflectance workflow", geographic_coverage_display="Commercial processing; exact assessed-product coverage not publicly stated")
enrich("constellr-lstprecision", "Constellr LSTprecision specifications", "https://constellr.github.io/product-lst/LST-precision/", spatial_resolution_m=30, spatial_resolution_options_m=[30], spatial_resolution_display="30 m LST and SR", spatial_resolution_basis="product", nominal_revisit_days=2.25, nominal_revisit_display="1.5–3 days", revisit_days=2.25, revisit_display="1.5–3 days", revisit_basis="product", geographic_coverage="Local or targeted", geographic_coverage_display="Worldwide tasking; AOI up to 15 × 15 km; up to 1,000,000 km² daily imaging capacity", coverage_basis="product", swath_width="17.5 km", data_format="GeoTIFF + GeoJSON metadata", geometric_accuracy_display="<1 pixel", geometric_accuracy_metric="spatial accuracy", geometric_accuracy_value=1, geometric_accuracy_unit="pixel", radiometric_accuracy_display="Temperature accuracy <1–2 K; NEDT 0.03 K", radiometric_accuracy_metric="temperature accuracy", radiometric_accuracy_value=2, radiometric_accuracy_unit="K", operational_status="Operational commercial tasking")
enrich("desis-l2a", "DLR EOC DESIS L2A collection", "https://geoservice.dlr.de/web/datasets/desis_l2_hsi", spatial_resolution_m=30, spatial_resolution_options_m=[30], spatial_resolution_display="About 30 m", spatial_resolution_basis="product", geographic_coverage="Global", geographic_coverage_display="Worldwide acquisitions; global L2A collection", coverage_basis="product", atmospheric_correction="PACO land atmospheric correction", coordinate_system="UTM or geographic (request-dependent)", data_format="Cloud Optimized GeoTIFF", swath_width="About 30 km (instrument-level)", operational_status="Operational since 2019")
enrich("earthdaily-constellation", "EarthDaily L2A product specification", "https://earthdaily.com/hubfs/NGEOS%20PDFs/Next%20Generation%20EO%20Forum%20-%20EDC%20DATA%20PRODUCTS.pdf?hsLang=en", spatial_resolution_m=5, spatial_resolution_options_m=[5, 10, 80, 120], spatial_resolution_display="5 m VNIR; 10 m additional VNIR; 80 m SWIR; 120 m thermal", spatial_resolution_basis="product", nominal_revisit_days=1, nominal_revisit_display="Daily constellation refresh", revisit_days=1, revisit_display="Daily constellation refresh", revisit_basis="constellation", geographic_coverage="Global", geographic_coverage_display="Global land imaging, refreshed daily", coverage_basis="product", radiometric_bit_depth=16, radiometric_bit_depth_display="UInt16 output storage (not sensor quantisation)", bit_depth_basis="output_product", swath_width="About 240 km (instrument-level)", coordinate_system="UTM / WGS84", data_format="Cloud Optimized GeoTIFF", operational_status="Constellation deployment/operations underway")
enrich("enmap-l2a", "EnMAP Data & Access", "https://www.enmap.org/data_access/", spatial_resolution_m=30, spatial_resolution_options_m=[30], spatial_resolution_display="30 m product grid", spatial_resolution_basis="product", geographic_coverage="Global", geographic_coverage_display="Global mission L2A collection; acquisitions are tasked", coverage_basis="product", atmospheric_correction="PACO land surface-reflectance processor", coordinate_system="UTM zone of scene centre", data_format="Cloud Optimized GeoTIFF + XML metadata", swath_width="30 km (instrument-level)", operational_status="Operational")

for identifier in ["aircas-l8-sr", "aircas-l8-st"]:
    enrich(identifier, "Existing prototype value retained for review", "", evidence="other_authoritative_source", confidence="ambiguous", spatial_resolution_m=30, spatial_resolution_options_m=[30], spatial_resolution_display="30 m (retained prototype value; product-level confirmation pending)", spatial_resolution_basis="mission", nominal_revisit_days=16, nominal_revisit_display="16 days (Landsat-8 mission-level)", revisit_days=16, revisit_display="16 days (mission-level)", revisit_basis="mission", radiometric_bit_depth=12, radiometric_bit_depth_display="12-bit Landsat-8 instrument quantisation; output encoding not confirmed", bit_depth_basis="source_instrument")
    BY_ID[identifier]["notes"] += " Existing AIR-CAS demo technical values are retained with ambiguous or mission-level provenance and require manual confirmation."

LANDSAT_TECH = "https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products"
for identifier in ["landsat-c2-sr", "landsat-c2-st", "landsat-c2-usard-sr", "landsat-c2-usard-st"]:
    usard = "usard" in identifier
    enrich(identifier, "USGS Landsat Collection 2 product documentation", LANDSAT_TECH, spatial_resolution_m=30, spatial_resolution_options_m=[30], spatial_resolution_display="30 m product grid", spatial_resolution_basis="product", nominal_revisit_days=16, nominal_revisit_display="16 days per Landsat mission; not product latency", revisit_days=16, revisit_display="16 days per mission", revisit_basis="mission", geographic_coverage="National" if usard else "Global", geographic_coverage_display="United States ARD tiles" if usard else "Global scene-based Collection 2", coverage_basis="product", coordinate_system="Albers Equal Area Conic" if usard else "UTM / Polar Stereographic", data_format="Cloud Optimized GeoTIFF", operational_status="Operational", swath_width="185 km (mission-level)")
    BY_ID[identifier]["radiometric_bit_depth_display"] = "INT16 product storage; not treated as radiometric resolution"
    BY_ID[identifier]["bit_depth_basis"] = "output_product"
enrich("landsat-c2-sr", "USGS Collection 2 Surface Reflectance", "https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-reflectance", atmospheric_correction="LEDAPS (Landsat 4–7) / LaSRC (Landsat 8–9)", elevation_model="ETOPO5/CMGDEM used by SR processing")
enrich("landsat-c2-st", "USGS Collection 2 Surface Temperature", "https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-temperature", atmospheric_correction="Single-channel ST retrieval with atmospheric profiles", elevation_model="ASTER GED emissivity input")
enrich("landsat-c2-usard-sr", "USGS U.S. ARD documentation", "https://www.usgs.gov/landsat-missions/landsat-collection-2-us-analysis-ready-data", atmospheric_correction="LEDAPS / LaSRC", elevation_model="USGS elevation inputs; exact collection/version varies")
enrich("landsat-c2-usard-st", "USGS U.S. ARD documentation", "https://www.usgs.gov/landsat-missions/landsat-collection-2-us-analysis-ready-data", atmospheric_correction="Single-channel ST retrieval with atmospheric profiles", elevation_model="ASTER GED emissivity input")

enrich("novasar1-rtc", "CSIRO NovaSAR-1 acquisition modes and ARD documentation", "https://research.csiro.au/cceo/wp-content/uploads/sites/252/2021/06/NovaSAR-1-Acquisition-Modes.pdf", spatial_resolution_options_m=[6, 20, 30, 33, 35, 50], spatial_resolution_display="Mode-dependent assessed family: 6–50 m across StripMap/ScanSAR variants", spatial_resolution_basis="product", geographic_coverage="Local or targeted", geographic_coverage_display="Tasked acquisitions; CSIRO access subject to registration/licence", coverage_basis="product", swath_width="13–400 km depending mode (instrument-level)", data_format="GeoTIFF", geometric_accuracy_display="Mode-specific geolocation assessment published; no single comparable value recorded", operational_status="Operational/tasked access")
enrich("nrcan-rcm-nrb", "Official CEOS peer-review assessments", BY_ID["nrcan-rcm-nrb"]["peer_review_url"], evidence="peer_review_summary", spatial_resolution_options_m=[16, 30], spatial_resolution_display="16 m StripMap and 30 m ScanSAR assessed variants", spatial_resolution_basis="product", geographic_coverage="National", geographic_coverage_display="Canada landmass / NRCan production scope", coverage_basis="product", atmospheric_correction="Not applicable (SAR); normalized radar backscatter")
enrich("nrcan-rcm-pol", "NRCan RCM CEOS-ARD open-data description", "https://registry.opendata.aws/rcm-ceos-ard/", spatial_resolution_m=30, spatial_resolution_options_m=[16, 30], spatial_resolution_display="30 m Compact-Polarization coverage; 16 m StripMap also assessed", spatial_resolution_basis="product", product_update_frequency_days=12, product_update_frequency_display="Every 12 days (initial Canada-wide dataset)", geographic_coverage="National", geographic_coverage_display="Canada landmass", coverage_basis="product", data_format="STAC + cloud object assets", atmospheric_correction="Not applicable (SAR); NRB/POL processing")
enrich("opera-rtc-sentinel1", "NASA/JPL OPERA RTC product", "https://www.jpl.nasa.gov/go/opera/products/rtc-product/", spatial_resolution_m=30, spatial_resolution_options_m=[30], spatial_resolution_display="30 m posting", spatial_resolution_basis="product", geographic_coverage="Global", geographic_coverage_display="Near-global land masses excluding Antarctica", coverage_basis="product", elevation_model="Copernicus GLO-30 DEM", coordinate_system="Predefined UTM / Polar Stereographic", data_format="GeoTIFF", atmospheric_correction="Not applicable (SAR); radiometric terrain correction", operational_status="In production")
enrich("proba-v-l3-toc", "VITO PROBA-V Level-3 TOC", "https://proba-v.vgt.vito.be/en/product-types/c2/level-3toc", spatial_resolution_options_m=[100, 333, 1000], spatial_resolution_display="100 m, 333 m and 1 km in CEOS assessed name; provider page currently says 100 m, 300 m and 1 km", spatial_resolution_basis="product", product_update_frequency_display="1-day and 10-day composites; 5-day at 100 m", geographic_coverage="Global", geographic_coverage_display="Global composites, 75°N to 56°S", coverage_basis="product", atmospheric_correction="SMAC", operational_status="Mission complete; archive 2013/2014–2020")
enrich("risat1a-eos04-nrb", "NRSC EOS-04 specifications", "https://bhoonidhi.nrsc.gov.in/bhoonidhi_resources/help/sampleprods/EOS-04/EOS-04-Specs.pdf", confidence="mission_or_instrument_level_only", evidence="mission_instrument_documentation", spatial_resolution_options_m=[33, 50], spatial_resolution_display="MRS 33 m and CRS 50 m mission-mode resolution; exact ARD pixel spacing requires review", spatial_resolution_basis="instrument", swath_width="160 km MRS; 223 km CRS (instrument-level)", data_format="GeoTIFF", atmospheric_correction="Not applicable (SAR); NRB processing")
enrich("risat1a-eos04-india-mosaic", "Official CEOS peer-review assessment", BY_ID["risat1a-eos04-india-mosaic"]["peer_review_url"], evidence="peer_review_summary", spatial_resolution_m=18, spatial_resolution_options_m=[18], spatial_resolution_display="18 m MRS ScanSAR mosaic", spatial_resolution_basis="product", geographic_coverage="National", geographic_coverage_display="India mosaic", coverage_basis="product", data_format="GeoTIFF", atmospheric_correction="Not applicable (SAR); NRB mosaic")
enrich("ga-sentinel1-nrb", "Geoscience Australia agency report to CEOS WGCV", "https://ceos.org/document_management/Working_Groups/WGCV/Meetings/WGCV-55/Presentations/1.6%20M%20Thankappan%20WGCV-55%20GA%20Agency%20Report.pdf", evidence="other_authoritative_source", spatial_resolution_m=20, spatial_resolution_options_m=[20], spatial_resolution_display="20 m", spatial_resolution_basis="product", geographic_coverage="Continental or multi-country", geographic_coverage_display="Australia and Antarctica", coverage_basis="product", atmospheric_correction="Not applicable (SAR); OPERA-RTC/ISCE3-derived NRB")
enrich("opera-disp-sentinel1", "NASA/JPL OPERA DISP product suite", "https://www.jpl.nasa.gov/go/opera/products/disp-product-suite/", spatial_resolution_m=30, spatial_resolution_options_m=[30], spatial_resolution_display="30 m posting", spatial_resolution_basis="product", product_update_frequency_display="Created for each acquisition; nominal input sampling can be 6, 12 or 24 days", geographic_coverage="Continental or multi-country", geographic_coverage_display="North America: U.S. and territories, border Canada, Mexico and Central America through Panama", coverage_basis="product", data_format="HDF5", atmospheric_correction="Not applicable (InSAR); atmospheric/tropospheric corrections documented separately", operational_status="In production")
enrich("dea-sentinel1-rtc", "Digital Earth Africa Sentinel-1 NRB specification", "https://docs.digitalearthafrica.org/en/latest/data_specs/Sentinel-1_specs.html", spatial_resolution_m=20, spatial_resolution_options_m=[20], spatial_resolution_display="Approximately 20 m", spatial_resolution_basis="product", nominal_revisit_display="6–12 days (mission acquisition over Africa)", revisit_display="6–12 days (mission-level)", revisit_basis="mission", geographic_coverage="Continental or multi-country", geographic_coverage_display="Digital Earth Africa service area", coverage_basis="product", data_format="GeoTIFF / Open Data Cube assets", atmospheric_correction="Not applicable (SAR); gamma-0 RTC", operational_status="Operational service")
enrich("sentinel2-level2a", "Copernicus SentiWiki Sentinel-2 L2A", "https://sentiwiki.copernicus.eu/web/s2-products", spatial_resolution_m=10, spatial_resolution_options_m=[10, 20, 60], spatial_resolution_display="10 m, 20 m and 60 m band products", spatial_resolution_basis="product", nominal_revisit_days=5, nominal_revisit_display="5 days with Sentinel-2A/2B (constellation-level)", revisit_days=5, revisit_display="5 days (constellation-level)", revisit_basis="constellation", geographic_coverage="Global", geographic_coverage_display="Global systematic L2A coverage", coverage_basis="product", radiometric_bit_depth_display="DN range uses a 15-bit-scale encoding with offsets; not treated as radiometric bit depth", bit_depth_basis="output_product", swath_width="290 km (instrument-level)", atmospheric_correction="Operational L2A processing / Sen2Cor", coordinate_system="UTM / WGS84 tiled grid", data_format="SAFE with JPEG2000 imagery", operational_status="Operational")
enrich("synspective-strix-nrb", "Synspective StriX data products", "https://synspective.com/data/synspective-sar-data/", spatial_resolution_options_m=[0.25, 0.46, 0.5, 0.9, 2.6, 3.6], spatial_resolution_display="Mode-dependent provider specifications (~0.46–3.6 m ground/azimuth; exact assessed NRB configurations not confirmed)", spatial_resolution_basis="instrument", nominal_revisit_display="Daily visits stated for constellation (mission-level)", revisit_display="Daily visits (constellation-level)", revisit_basis="constellation", geographic_coverage="Local or targeted", geographic_coverage_display="Commercial tasked acquisitions", coverage_basis="product", swath_width="10–30 km depending mode (instrument-level)", elevation_model="Copernicus DEM GLO-30 for current ORT products", coordinate_system="Fixed UTM grid for ORT", data_format="Cloud Optimized GeoTIFF + XML", atmospheric_correction="Not applicable (SAR); gamma-nought RTC available", operational_status="Commercial constellation operating")

apply_approved_review_changes()

INSTRUMENTS = {
    "constellr-lstprecision": ["SkyBee VNIR camera", "SkyBee TIR camera"],
    "earthdaily-constellation": ["VNIR/SWIR/TIR imaging payload"],
    "aircas-l8-sr": ["OLI"], "aircas-l8-st": ["OLI", "TIRS"],
    "landsat-c2-sr": ["TM", "ETM+", "OLI", "OLI-2"],
    "landsat-c2-st": ["TM", "ETM+", "TIRS", "TIRS-2"],
    "landsat-c2-usard-sr": ["TM", "ETM+", "OLI", "OLI-2"],
    "landsat-c2-usard-st": ["TM", "ETM+", "TIRS", "TIRS-2"],
    "novasar1-rtc": ["S-band SAR"], "nrcan-rcm-nrb": ["C-band SAR"], "nrcan-rcm-pol": ["C-band SAR"],
    "proba-v-l3-toc": ["VEGETATION"], "risat1a-eos04-nrb": ["C-band SAR"], "risat1a-eos04-india-mosaic": ["C-band SAR"],
    "synspective-strix-nrb": ["X-band SAR"],
}
for identifier in ["catalyst-sentinel1-rtc", "opera-rtc-sentinel1", "ga-sentinel1-nrb", "opera-disp-sentinel1", "dea-sentinel1-rtc"]:
    INSTRUMENTS[identifier] = ["C-SAR"]
for identifier, names in INSTRUMENTS.items():
    p = BY_ID[identifier]
    p["instruments"] = names
    p["sensor_or_instrument_type"] = ", ".join(names)
    FIELD_PROVENANCE[(identifier, "instruments")] = (
        "Official provider mission/product documentation", p.get("information_url") or REGISTER,
        "mission_instrument_documentation", "mission_or_instrument_level_only",
        "Canonical associated instrument/payload name; not treated as a separate CEOS product record.",
    )

# The original prototype's active values are preserved where official product evidence replaced them;
# unverified AIR-CAS values remain visibly qualified rather than silently discarded.

RESEARCHED_FIELDS = [
    "ceos_ard_status", "pfs_type", "pfs_version", "approval_date", "agency", "missions", "instruments",
    "ard_tier", "ard_tier_display", "ard_tier_notes", "ceos_ard_assessment_level", "spatial_resolution_m", "spatial_resolution_options_m", "spatial_resolution_display", "spatial_resolution_basis",
    "nominal_revisit_days", "nominal_revisit_display", "product_update_frequency_days",
    "product_update_frequency_display", "revisit_basis", "geographic_coverage", "geographic_coverage_display", "coverage_basis",
    "radiometric_bit_depth", "radiometric_bit_depth_display", "bit_depth_basis", "output_storage_bit_depth", "output_storage_display", "output_data_type", "geometric_accuracy_display",
    "geometric_accuracy_metric", "geometric_accuracy_value", "geometric_accuracy_unit", "radiometric_accuracy_display",
    "radiometric_accuracy_metric", "radiometric_accuracy_value", "radiometric_accuracy_unit", "operational_status", "swath_width", "atmospheric_correction",
    "elevation_model", "coordinate_system", "data_format", "access_url", "information_url",
    "self_assessment_url", "peer_review_url", "sample_product_url",
]


def rendered(value):
    if value is None or value == [] or value == "":
        return ""
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def research_rows():
    rows = []
    register_fields = {"ceos_ard_status", "pfs_type", "pfs_version", "approval_date", "agency", "missions", "instruments", "access_url", "information_url", "self_assessment_url", "peer_review_url", "sample_product_url"}
    for p in P:
        for field in RESEARCHED_FIELDS:
            value = p.get(field)
            provenance = FIELD_PROVENANCE.get((p["id"], field))
            if provenance:
                title, url, evidence, confidence, note = provenance
            elif field in register_fields and value not in (None, [], ""):
                title, url, evidence, confidence, note = "CEOS Analysis-Ready Datasets register", REGISTER, "official_ceos_register", "confirmed_product_level", ""
            elif value not in (None, [], "", "Unknown"):
                title, url, evidence, confidence, note = "Curated primary-source synthesis", p.get("information_url") or REGISTER, "provider_product_documentation", "likely_product_level", "Basis and caution fields in the catalogue qualify scope."
            else:
                title, url, evidence, confidence, note = "CEOS register and consulted primary product sources", p.get("information_url") or REGISTER, "official_ceos_register", "not_found", "No reliable product-level value located during this scoped pass."
            rows.append({
                "product_id": p["id"], "official_product_name": p["official_product_name"],
                "field_name": field, "recorded_value": rendered(value), "source_title": title,
                "source_url": url or "", "source_type": "primary" if evidence != "other_authoritative_source" else "authoritative_supplementary",
                "evidence_level": evidence, "confidence": confidence, "notes": note,
                "date_checked": FIELD_CHECKED.get((p["id"], field), CHECKED),
            })
    return rows


MANUAL = [
    {"product": "PROBA-V L3 0.1/0.333/1 km TOC", "issue": "Resolution wording conflict", "competing_values_or_possible_matches": "CEOS assessed name says 0.333 km; current provider page describes the middle product as 300 m.", "recommended_manual_action": "Check the exact assessed Collection 2 product metadata/version and decide whether 300 m or 333 m should drive filtering."},
    {"product": "RISAT-1A EOS-04 NRB", "issue": "Resolution versus pixel-spacing ambiguity", "competing_values_or_possible_matches": "Official mission documents describe MRS as 33 m (another specification table gives 25 m × 8 m) and CRS as 50 m × 8 m; the assessed ARD package covers MRS/CRS.", "recommended_manual_action": "Inspect the assessment sample metadata and record product pixel spacing separately from effective resolution."},
    {"product": "L8 SR (Aerospace Information Research Institute)", "issue": "Legacy demo technical fields not product-confirmed", "competing_values_or_possible_matches": "30 m, 16-day revisit and 12-bit values are retained as product-grid/mission/instrument context; other demo processing fields were not promoted.", "recommended_manual_action": "Extract the AIR-CAS self-assessment/sample metadata and replace qualified legacy values with product-level evidence."},
    {"product": "L8 ST (Aerospace Information Research Institute)", "issue": "Sparse public technical metadata", "competing_values_or_possible_matches": "CEOS register and assessment links are confirmed, but scalar uncertainty and output encoding were not established.", "recommended_manual_action": "Inspect the AIR-CAS self-assessment and sample package for ST grid, uncertainty and encoding."},
    {"product": "Landsat Collection 2 Surface Reflectance", "issue": "Existing mission-specific demo variants consolidated", "competing_values_or_possible_matches": "The four Landsat 8/9 SR demo cards map to two official multi-mission assessments (global C2 SR and U.S. ARD SR).", "recommended_manual_action": "Keep the official assessment cards as canonical; add mission-variant views only if the UI later supports variants without duplicate cards."},
    {"product": "EarthDaily Constellation", "issue": "Assessment predates evolving constellation/product documentation", "competing_values_or_possible_matches": "Current official documentation reports 5/10/80/120 m outputs and active deployment; exact assessed-version boundaries should be checked.", "recommended_manual_action": "Confirm that current L2A specification is identical to the October 2025 assessed version before treating every band-resolution option as assessed."},
    {"product": "Synspective StriX Series NRB", "issue": "Assessed configurations not public in a simple table", "competing_values_or_possible_matches": "Provider lists multiple current acquisition modes and resolutions; exact CEOS-assessed NRB modes are not unambiguously stated on the register.", "recommended_manual_action": "Read the full peer-review package and sample metadata before setting a single spatial-resolution filter value."},
]


def write_outputs():
    DATA.mkdir(exist_ok=True)
    REPORTS.mkdir(exist_ok=True)
    (DATA / "ceos_ard_products.json").write_text(json.dumps(P, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    rows = research_rows()
    with (DATA / "ceos_ard_research_log.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader(); writer.writerows(rows)
    with (REPORTS / "ceos_ard_manual_review.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(MANUAL[0]))
        writer.writeheader(); writer.writerows(MANUAL)

    tier_count = sum(bool(p["ard_tier"]) for p in P)
    spatial_count = sum(p["spatial_resolution_m"] is not None and p["spatial_resolution_basis"] == "product" for p in P)
    timing_count = sum(bool((p["revisit_basis"] == "product" and p["nominal_revisit_display"]) or p["product_update_frequency_display"]) for p in P)
    bit_count = sum(p["radiometric_bit_depth"] is not None and p["bit_depth_basis"] == "output_product" for p in P)
    geom_count = sum(bool(p["geometric_accuracy_display"]) for p in P)
    rad_count = sum(bool(p["radiometric_accuracy_display"]) for p in P)
    summary = f"""# CEOS-ARD catalogue population summary

Catalogue synthesis checked: {CHECKED}
Approved review document: reports/ceos_ard_changes_2026-09-14.csv

## Outcome

- Supplied assessments: **{len(P)}**
- Added as canonical researched catalogue records: **{len(P)}**
- Existing demo records matched: **7 of 7** (consolidated into 5 canonical assessment records)
- Existing values silently overwritten: **0**
- Manual-review issues: **{len(MANUAL)}**
- Products with an explicitly confirmed overall tier: **{tier_count}**
- Products with confirmed product-level primary spatial resolution: **{spatial_count}**
- Products with confirmed product-level revisit or update information: **{timing_count}**
- Products with confirmed output-product bit-depth information: **{bit_count}**
- Products with geometric accuracy information: **{geom_count}**
- Products with radiometric/temperature accuracy information: **{rad_count}**
- User-approved review rows applied: **{sum(1 for value in FIELD_PROVENANCE.values() if value[0] == 'User-approved CEOS-ARD change review')}**
- Blank rows in the edited review document ignored: **intentional removals**
- Review before-value conflicts: **{len(REVIEW_CONFLICTS)}**

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
"""
    if REVIEW_CONFLICTS:
        summary += "\n## Review conflicts\n\n" + "\n".join(f"- {item}" for item in REVIEW_CONFLICTS) + "\n"
    (REPORTS / "ceos_ard_population_summary.md").write_text(summary, encoding="utf-8")
    (REPORTS / "possible_additional_products.md").write_text("""# Possible additional products

No additional CEOS-ARD-approved products were confirmed outside the supplied scope during this pass. The live register also contains many future, under-development, and under-peer-review records; these were deliberately not promoted or suggested as approved catalogue products.
""", encoding="utf-8")


if __name__ == "__main__":
    write_outputs()
