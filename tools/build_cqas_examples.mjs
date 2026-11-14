#!/usr/bin/env node
/**
 * Writes one EXAMPLE C-QAS report (cqas-report/2) per curated CEOS-ARD product to data/cqas/.
 *
 * The C-QAS test system is still being built, so every value here is made up. The aim is that
 * each report is *plausible for its product*: real requirement names from the product's CEOS-ARD
 * specification, a real cal/val site suited to the sensor, the sensor's own channels, a native
 * pixel size from the catalogue and differences of a sensible size. Values are seeded from the
 * product ID, so they differ between products but stay the same on every run.
 *
 *   node tools/build_cqas_examples.mjs          write every report
 *   node tools/build_cqas_examples.mjs --check  fail if any written report would change
 *
 * Inputs: data/ceos_ard_products.json (names, pixel sizes) and
 * tools/data/ceos_ard_pfs_requirements.json (requirement names and levels, from ceos-org/ceos-ard).
 * landsat-c2-sr keeps the values of the original C-QAS report mock-up (fixed below).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogue = JSON.parse(readFileSync(resolve(ROOT, 'data/ceos_ard_products.json'), 'utf8'));
const specs = JSON.parse(readFileSync(resolve(ROOT, 'tools/data/ceos_ard_pfs_requirements.json'), 'utf8')).specifications;
const CHECK = process.argv.includes('--check');
const REPORT_DATE = '2026-10-12';

// ------------------------------------------------------------------------------------ helpers

function hash(text) {
	let h = 2166136261;
	for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
	return h >>> 0;
}
/** Seeded random numbers (mulberry32). */
function rng(seed) {
	let a = seed;
	const next = () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	return {
		next,
		between: (lo, hi) => lo + (hi - lo) * next(),
		normal: () => Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next()),
		int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next())
	};
}
const round = (value, digits) => Number(value.toFixed(digits));
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const list = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

// ------------------------------------------------------------------------------------ cal/val sites

const SITES = {
	RVUS: { network: 'RadCalNet', code: 'RVUS', name: 'Railroad Valley Playa, USA' },
	LCFR: { network: 'RadCalNet', code: 'LCFR', name: 'La Crau, France' },
	GONA: { network: 'RadCalNet', code: 'GONA', name: 'Gobabeb, Namibia' },
	BTCN: { network: 'RadCalNet', code: 'BTCN', name: 'Baotou, China' },
	LIBYA4: { network: 'CEOS PICS', code: 'LIBYA4', name: 'Libya-4 desert site' },
	ALGERIA3: { network: 'CEOS PICS', code: 'ALGERIA3', name: 'Algeria-3 desert site' },
	TAHOE: { network: 'NASA/JPL buoys', code: 'TAHOE', name: 'Lake Tahoe, USA' },
	GBB: { network: 'KIT LST stations', code: 'GBB', name: 'Gobabeb, Namibia' },
	EVO: { network: 'KIT LST stations', code: 'EVO', name: 'Évora, Portugal' },
	SURAT: { network: 'Corner reflector array', code: 'SURAT', name: 'Surat Basin, Australia' },
	ROSAMOND: { network: 'Corner reflector array', code: 'ROSAMOND', name: 'Rosamond, USA' },
	TOMAKOMAI: { network: 'Corner reflector array', code: 'TOMAKOMAI', name: 'Tomakomai, Japan' },
	SHADNAGAR: { network: 'Corner reflector array', code: 'SHADNAGAR', name: 'Shadnagar, India' }
};

// ------------------------------------------------------------------------------------ PFS selections

/** Requirements C-QAS is planned to check automatically, per specification (IDs from the specification). */
const CHECKED = {
	SR: ['meta-memare-optical', 'meta-time-sr', 'meta-crs-optical', 'meta-specband', 'meta-daccess', 'pxl-pinodat', 'pxl-picloud', 'rac-measur-sr', 'rac-muncer-sr', 'gcor-geocorr-sr'],
	ST: ['meta-memare-st', 'meta-time-st', 'meta-crs-ar', 'meta-daccess-st', 'meta-measurunc', 'pxl-pinodat-st', 'pxl-picloud-st', 'rac-measur-st', 'rac-muncer-st', 'gcor-geocorr-st'],
	NRB: ['meta-memare-sar', 'meta-time-sar', 'src-orbit', 'prod-daccess-prod', 'prod-samspa', 'prod-crs-sar', 'pxl-damaski', 'rcm-backsca-nrb', 'rcm-radacc-sar', 'gcor-cdem', 'gcor-geomacc-sar'],
	POL: ['meta-memare-sar', 'meta-time-sar', 'src-orbit', 'prod-daccess-prod', 'prod-samspa', 'prod-crs-sar', 'pxl-damaski', 'rcm-backsca-pol', 'rcm-radacc-sar', 'gcor-cdem', 'gcor-geomacc-sar'],
	INSAR: ['meta-memare-sar', 'meta-time-sar', 'src-orbit-insar', 'prod-daccess-prod', 'prod-crs-sar', 'prod-inspair', 'prod-phasun', 'prod-catpha', 'pxl-damaski', 'gcor-cdem', 'gcor-geomacc-sar']
};
const SPEC_SHORT = { SR: 'SR', ST: 'ST', NRB: 'NRB', POL: 'POL', INSAR: 'InSAR' };
const SPEC_CODE = { SR: 'S', ST: 'T', NRB: 'N', POL: 'P', INSAR: 'I' };

/** What the data provider should do about each kind of gap. */
const ACTIONS = {
	'meta-daccess': 'Supply the Data Access DOI.',
	'meta-daccess-st': 'Supply the Data Access DOI.',
	'prod-daccess-prod': 'Record the product data access link in the metadata.',
	'gcor-geocorr-sr': 'Supply grid and coverage evidence for the geometric correction.',
	'gcor-geocorr-st': 'Supply grid and coverage evidence for the geometric correction.',
	'gcor-geomacc-sar': 'Add the geolocation accuracy statement to the product metadata.',
	'meta-measurunc': 'Supply the per-pixel uncertainty layer described in the metadata.',
	'rac-muncer-st': 'Supply the per-pixel surface temperature uncertainty layer.',
	'src-orbit': 'Record the orbit source (restituted or precise) in the metadata.',
	'src-orbit-insar': 'Record the orbit source for both acquisitions in the metadata.',
	'pxl-picloud': 'Document the cloud mask algorithm and its version.',
	'meta-time-sr': 'Give acquisition start and end times in UTC.',
	'gcor-cdem': 'Name the DEM and its version in the metadata.',
	'prod-phasun': 'Describe the phase unwrapping method in the metadata.'
};

// ------------------------------------------------------------------------------------ method families

const GEO = {
	G1: { kind: 'relative', label: 'DEMO-G1', method: 'demo-v1', comparison: 'Same-platform repeat image', match_unit: 'image matches', meaning: 'Relative image-to-image matching, demo-v1' },
	G2: { kind: 'absolute', label: 'DEMO-G2', method: 'demo-v1', comparison: 'Surveyed corner reflector positions', match_unit: 'corner reflectors', meaning: 'Corner reflector location, demo-v1' }
};
const RAD = {
	R1: { label: 'DEMO-R1', comparison: 'Observed minus RadCalNet surface reference', meaning: 'RadCalNet surface reflectance comparison, demo-v1' },
	R2: { label: 'DEMO-R2', comparison: 'Observed minus desert site (PICS) model', meaning: 'Desert site (PICS) model comparison, demo-v1' },
	R3: { label: 'DEMO-R3', comparison: 'Observed minus in situ surface temperature', meaning: 'In situ surface temperature comparison, demo-v1' },
	R4: { label: 'DEMO-R4', comparison: 'Measured minus theoretical corner reflector RCS', meaning: 'Corner reflector radar cross-section, demo-v1' },
	R0: { meaning: 'No radiometric test defined for this product type' }
};

/** Typical site reflectance by channel name (for the relative difference). */
const SITE_REFLECTANCE = { blue: 0.25, green: 0.29, red: 0.33, 'near infrared': 0.37, 'shortwave infrared': 0.45 };

// ------------------------------------------------------------------------------------ products

/**
 * One profile per catalogue product. `px` is the native pixel size used for the geometric test;
 * where the catalogue has no single value (marked "not in catalogue") it is the assessed variant named.
 */
const PRODUCTS = {
	// ---- Surface reflectance
	'landsat-c2-sr': {
		spec: 'SR', domain: 'optical', abbr: 'L8', platform: 'Landsat 8', instrument: 'OLI', px: 30,
		scene: 'LC08_L2SP_040033_20251201_20251209_02_T1', date: '2025-12-01', path: 40, row: 33, site: 'RVUS',
		geo: 'G1', rad: 'R1',
		channels: [['B2', 'blue'], ['B3', 'green'], ['B4', 'red'], ['B5', 'near infrared']], headline: 'B4',
		series: { sites: ['RVUS', 'GONA', 'LCFR'], start: '2024-01-15', end: '2025-11-20', n: 16 },
		fails: [{ id: 'meta-daccess', reason: 'Data Access DOI not supplied' }, { id: 'gcor-geocorr-sr', reason: 'Grid / coverage evidence missing' }],
		fixed: true
	},
	'landsat-c2-usard-sr': {
		spec: 'SR', domain: 'optical', abbr: 'USARD-SR', platform: 'Landsat 9', instrument: 'OLI-2', px: 30,
		scene: 'LC09_CU_005009_20250723_20250802_02', date: '2025-07-23', site: 'RVUS',
		geo: 'G1', rad: 'R1', channels: [['B2', 'blue'], ['B3', 'green'], ['B4', 'red'], ['B5', 'near infrared'], ['B6', 'shortwave infrared']], headline: 'B4',
		px_rmse: 0.38, bias: 0.004, fails: [], series: { sites: ['RVUS', 'LCFR'], start: '2024-02-01', end: '2025-12-10', n: 14 },
		scene_note: 'Example U.S. ARD tile over the site; tiles have no WRS path and row.'
	},
	'aircas-l8-sr': {
		spec: 'SR', domain: 'optical', abbr: 'AIRCAS-SR', platform: 'Landsat 8', instrument: 'OLI', px: 30,
		scene: 'AIRCAS_L8SR_128032_20250815_V10', date: '2025-08-15', path: 128, row: 32, site: 'BTCN',
		geo: 'G1', rad: 'R1', channels: [['B2', 'blue'], ['B3', 'green'], ['B4', 'red'], ['B5', 'near infrared']], headline: 'B4',
		px_rmse: 0.44, bias: -0.005, fails: [{ id: 'meta-daccess', reason: 'Data Access DOI not supplied' }],
		series: { sites: ['BTCN', 'RVUS'], start: '2024-03-10', end: '2025-11-05', n: 10 }
	},
	'sentinel2-level2a': {
		spec: 'SR', domain: 'optical', abbr: 'S2-L2A', platform: 'Sentinel-2B', instrument: 'MSI', px: 10,
		scene: 'S2B_MSIL2A_20250714T103029_N0511_R108_T31TFJ_20250714T131544', date: '2025-07-14', site: 'LCFR',
		geo: 'G1', rad: 'R1', channels: [['B2', 'blue'], ['B3', 'green'], ['B4', 'red'], ['B8', 'near infrared'], ['B11', 'shortwave infrared']], headline: 'B4',
		px_rmse: 0.29, bias: 0.007, fails: [], series: { sites: ['LCFR', 'GONA', 'RVUS'], start: '2024-01-20', end: '2025-12-05', n: 18 },
		scene_note: 'Example Sentinel-2 tile T31TFJ over the site; Sentinel-2 uses tiles, not path and row.'
	},
	'catalyst-spot5-hrg-2-5m': {
		spec: 'SR', domain: 'optical', abbr: 'SPOT5', platform: 'SPOT-5', instrument: 'HRG', px: 2.5,
		scene: 'CATALYST_SPOT5_HRG_PSH_20140612_101544_SR', date: '2014-06-12', site: 'LIBYA4',
		geo: 'G1', rad: 'R2', channels: [['B1', 'green'], ['B2', 'red'], ['B3', 'near infrared'], ['B4', 'shortwave infrared']], headline: 'B2',
		px_rmse: 0.58, bias: 0.009, window_m: 500,
		fails: [{ id: 'gcor-geocorr-sr', reason: 'Relative error 0.58 pixel exceeds the 0.5 pixel limit on this scene', action: 'Review the geometric correction: the measured error on this scene exceeds the 0.5 pixel limit.' }],
		series: { sites: ['LIBYA4'], start: '2012-03-01', end: '2015-02-20', n: 9 },
		scene_note: 'SPOT-5 operated until 2015, so the example scene and series predate RadCalNet; a desert (PICS) site is used instead.'
	},
	'proba-v-l3-toc': {
		spec: 'SR', domain: 'optical', abbr: 'PROBAV', platform: 'PROBA-V', instrument: 'VEGETATION', px: 333, // not in catalogue: 333 m variant
		scene: 'PROBAV_S1_TOC_X20Y05_20190615_333M_V101', date: '2019-06-15', site: 'LIBYA4',
		geo: 'G1', rad: 'R2', channels: [['BLUE', 'blue'], ['RED', 'red'], ['NIR', 'near infrared'], ['SWIR', 'shortwave infrared']], headline: 'RED',
		px_rmse: 0.24, bias: -0.006, window_m: 20000, fails: [], series: { sites: ['LIBYA4', 'ALGERIA3'], start: '2018-01-10', end: '2020-06-15', n: 12 },
		scene_note: 'Example 333 m daily composite tile. PROBA-V operations ended in 2020.'
	},
	'desis-l2a': {
		spec: 'SR', domain: 'optical', abbr: 'DESIS', platform: 'ISS', instrument: 'DESIS', px: 30,
		scene: 'DESIS-HSI-L2A-DT0865788448_008-20250519T201515-V0220', date: '2025-05-19', site: 'RVUS',
		geo: 'G1', rad: 'R1', channels: [['490 nm', 'blue'], ['560 nm', 'green'], ['665 nm', 'red'], ['865 nm', 'near infrared']], headline: '665 nm',
		px_rmse: 0.46, bias: 0.008, extra_rad_note: 'DESIS covers 400–1000 nm, so no shortwave infrared channel',
		fails: [{ id: 'gcor-geocorr-sr', reason: 'Grid / coverage evidence missing' }], series: { sites: ['RVUS', 'GONA'], start: '2023-06-01', end: '2025-10-01', n: 8 },
		scene_note: 'Hyperspectral: four channels near the multispectral bands are shown.'
	},
	'enmap-l2a': {
		spec: 'SR', domain: 'optical', abbr: 'ENMAP', platform: 'EnMAP', instrument: 'HSI', px: 30,
		scene: 'ENMAP01-____L2A-DT0000098761_20250618T093012Z_004_V010502_20250620T091233Z', date: '2025-06-18', site: 'GONA',
		geo: 'G1', rad: 'R1', channels: [['490 nm', 'blue'], ['665 nm', 'red'], ['865 nm', 'near infrared'], ['1610 nm', 'shortwave infrared'], ['2200 nm', 'shortwave infrared 2']], headline: '665 nm',
		px_rmse: 0.33, bias: -0.004, fails: [], series: { sites: ['GONA', 'RVUS', 'LCFR'], start: '2023-04-15', end: '2025-10-10', n: 10 },
		scene_note: 'Hyperspectral: five channels near the multispectral bands are shown.'
	},
	'earthdaily-constellation': {
		spec: 'SR', domain: 'optical', abbr: 'EDC', platform: 'EarthDaily Constellation', instrument: 'VNIR/SWIR/TIR imaging payload', px: 5,
		scene: 'EDC_L2A_SR_20260309T183522_T11SPC_V01', date: '2026-03-09', site: 'RVUS',
		geo: 'G1', rad: 'R1', channels: [['B2', 'blue'], ['B3', 'green'], ['B4', 'red'], ['B8', 'near infrared']], headline: 'B4',
		px_rmse: 0.41, bias: 0.006, fails: [{ id: 'meta-daccess', reason: 'Data Access DOI not supplied' }],
		series: { sites: ['RVUS', 'LCFR'], start: '2025-12-10', end: '2026-08-20', n: 6 },
		scene_note: 'New constellation: the series covers its first months of operation.'
	},
	// ---- Surface temperature
	'landsat-c2-st': {
		spec: 'ST', domain: 'thermal', abbr: 'L8-ST', platform: 'Landsat 8', instrument: 'TIRS', px: 30,
		scene: 'LC08_L2SP_043033_20250716_20250724_02_T1', date: '2025-07-16', path: 43, row: 33, site: 'TAHOE',
		geo: 'G1', rad: 'R3', channels: [['ST_B10', 'surface temperature from Band 10']], headline: 'ST_B10',
		px_rmse: 0.36, bias: 0.71, product_uncertainty: 'ST_QA uncertainty band supplied (0.9 K at the site)', fails: [],
		series: { sites: ['TAHOE', 'GBB', 'EVO'], start: '2024-01-25', end: '2025-12-01', n: 16 }
	},
	'landsat-c2-usard-st': {
		spec: 'ST', domain: 'thermal', abbr: 'USARD-ST', platform: 'Landsat 9', instrument: 'TIRS-2', px: 30,
		scene: 'LC09_CU_003008_20250808_20250818_02', date: '2025-08-08', site: 'TAHOE',
		geo: 'G1', rad: 'R3', channels: [['ST_B10', 'surface temperature from Band 10']], headline: 'ST_B10',
		px_rmse: 0.34, bias: 0.52, product_uncertainty: 'ST_QA uncertainty band supplied (0.8 K at the site)', fails: [],
		series: { sites: ['TAHOE', 'EVO'], start: '2024-02-10', end: '2025-11-25', n: 12 },
		scene_note: 'Example U.S. ARD tile over the site; tiles have no WRS path and row.'
	},
	'aircas-l8-st': {
		spec: 'ST', domain: 'thermal', abbr: 'AIRCAS-ST', platform: 'Landsat 8', instrument: 'TIRS', px: 30,
		scene: 'AIRCAS_L8ST_179076_20250411_V10', date: '2025-04-11', path: 179, row: 76, site: 'GBB',
		geo: 'G1', rad: 'R3', channels: [['LST', 'land surface temperature']], headline: 'LST',
		px_rmse: 0.39, bias: -0.94, fails: [{ id: 'meta-measurunc', reason: 'Per-pixel uncertainty layer not found' }],
		series: { sites: ['GBB', 'TAHOE'], start: '2024-03-01', end: '2025-11-15', n: 10 }
	},
	'constellr-lstprecision': {
		spec: 'ST', domain: 'thermal', abbr: 'CONSTELLR', platform: 'SkyBee A01', instrument: 'SkyBee TIR camera', px: 30,
		scene: 'CONSTELLR_LSTP_A01_20250903T104512_EVO_L2_V1', date: '2025-09-03', site: 'EVO',
		geo: 'G1', rad: 'R3', channels: [['LST', 'land surface temperature']], headline: 'LST',
		px_rmse: 0.45, bias: -0.62, rad_limit: { value: 2, source: 'Provider stated accuracy (<1–2 K)' },
		product_uncertainty: 'Per-pixel LST uncertainty supplied (1.1 K at the site)', fails: [],
		series: { sites: ['EVO', 'GBB'], start: '2025-03-05', end: '2026-08-25', n: 8 }
	},
	// ---- Radar backscatter (corner reflectors for location and radar cross-section)
	'ga-sentinel1-nrb': {
		spec: 'NRB', domain: 'radar', abbr: 'GA-S1', platform: 'Sentinel-1A', instrument: 'C-SAR', px: 20,
		scene: 'ga_s1a_nrb_1-0-0_T150-321038-IW2_20250812T193412Z', date: '2025-08-12', site: 'SURAT',
		geo: 'G2', rad: 'R4', channels: [['VV', 'co-polarised']], headline: 'VV',
		px_rmse: 0.17, bias: 0.12, fails: [], series: { sites: ['SURAT'], start: '2024-01-12', end: '2025-12-20', n: 14 }
	},
	'opera-rtc-sentinel1': {
		spec: 'NRB', domain: 'radar', abbr: 'OPERA-RTC', platform: 'Sentinel-1A', instrument: 'C-SAR', px: 30,
		scene: 'OPERA_L2_RTC-S1_T064-135524-IW1_20250806T014521Z_20250806T080125Z_S1A_30_v1.0', date: '2025-08-06', site: 'ROSAMOND',
		geo: 'G2', rad: 'R4', channels: [['VV', 'co-polarised']], headline: 'VV',
		px_rmse: 0.12, bias: -0.18, fails: [], series: { sites: ['ROSAMOND'], start: '2024-01-08', end: '2025-12-14', n: 14 }
	},
	'dea-sentinel1-rtc': {
		spec: 'NRB', domain: 'radar', abbr: 'DEA-S1', platform: 'Sentinel-1A', instrument: 'C-SAR', px: 20,
		scene: 's1_rtc_S1A_IW_20250819T171522_T150-321040_SURAT', date: '2025-08-19', site: 'SURAT',
		geo: 'G2', rad: 'R4', channels: [['VV', 'co-polarised']], headline: 'VV',
		px_rmse: 0.19, bias: 0.21, fails: [{ id: 'gcor-geomacc-sar', reason: 'Geolocation accuracy statement missing from metadata' }],
		series: { sites: ['SURAT'], start: '2024-02-01', end: '2025-12-10', n: 12 },
		scene_note: 'Example scene over a corner reflector array outside Africa, which has no public array yet.'
	},
	'catalyst-sentinel1-rtc': {
		spec: 'NRB', domain: 'radar', abbr: 'CATALYST-S1', platform: 'Sentinel-1A', instrument: 'C-SAR', px: 10,
		scene: 'CATALYST_S1A_IW_RTC_20250724T015012_ROSAMOND_10M', date: '2025-07-24', site: 'ROSAMOND',
		geo: 'G2', rad: 'R4', channels: [['VV', 'co-polarised']], headline: 'VV',
		px_rmse: 0.36, bias: 0.27, fails: [{ id: 'src-orbit', reason: 'Orbit source not recorded in metadata' }],
		series: { sites: ['ROSAMOND'], start: '2024-03-01', end: '2025-11-30', n: 10 }
	},
	'nrcan-rcm-nrb': {
		spec: 'NRB', domain: 'radar', abbr: 'RCM-NRB', platform: 'RCM-2', instrument: 'C-band SAR', px: 30, // not in catalogue: 30 m ScanSAR variant
		scene: 'RCM2_OK2981045_PK2981046_1_SC30MCPB_20250610_013012_HH_HV_NRB', date: '2025-06-10', site: 'ROSAMOND',
		geo: 'G2', rad: 'R4', channels: [['HH', 'co-polarised']], headline: 'HH',
		px_rmse: 0.15, bias: -0.24, fails: [], series: { sites: ['ROSAMOND'], start: '2024-01-20', end: '2025-12-05', n: 10 }
	},
	'novasar1-rtc': {
		spec: 'NRB', domain: 'radar', abbr: 'NOVASAR', platform: 'NovaSAR-1', instrument: 'S-band SAR', px: 20, // not in catalogue: 20 m ScanSAR variant
		scene: 'NovaSAR_01_41267_scd_31_250614_001523_HH_HV_RTC', date: '2025-06-14', site: 'SURAT',
		geo: 'G2', rad: 'R4', channels: [['HH', 'co-polarised']], headline: 'HH',
		px_rmse: 0.32, bias: 0.38, fails: [{ id: 'gcor-geomacc-sar', reason: 'Geolocation accuracy statement missing from metadata' }],
		series: { sites: ['SURAT'], start: '2024-02-15', end: '2025-11-20', n: 8 }
	},
	'synspective-strix-nrb': {
		spec: 'NRB', domain: 'radar', abbr: 'STRIX', platform: 'StriX', instrument: 'X-band SAR', px: 3, // not in catalogue: stripmap variant
		scene: 'STRIX-B_SM_20250921T013322_TOMAKOMAI_NRB_V1', date: '2025-09-21', site: 'TOMAKOMAI',
		geo: 'G2', rad: 'R4', channels: [['VV', 'co-polarised']], headline: 'VV',
		px_rmse: 1.38, bias: -0.33, fails: [{ id: 'src-orbit', reason: 'Orbit source not recorded in metadata' }],
		series: { sites: ['TOMAKOMAI'], start: '2025-01-15', end: '2026-08-10', n: 6 },
		scene_note: 'Fine 3 m pixels make the location error large in pixels but small in metres.'
	},
	'risat1a-eos04-nrb': {
		spec: 'NRB', domain: 'radar', abbr: 'EOS04', platform: 'RISAT-1A EOS-04', instrument: 'C-band SAR', px: 18, // not in catalogue: MRS ScanSAR spacing
		scene: 'EOS04_MRS_HH_HV_20250511_062431_L2_NRB', date: '2025-05-11', site: 'SHADNAGAR',
		geo: 'G2', rad: 'R4', channels: [['HH', 'co-polarised']], headline: 'HH',
		px_rmse: 0.4, bias: 0.31, fails: [{ id: 'prod-daccess-prod', reason: 'Product data access link not in the metadata' }],
		series: { sites: ['SHADNAGAR'], start: '2023-06-10', end: '2025-11-25', n: 10 }
	},
	'alos2-palsar2-25m-scansar-nrb': {
		spec: 'NRB', domain: 'radar', abbr: 'ALOS2-SCANSAR', platform: 'ALOS-2', instrument: 'PALSAR-2', px: 25,
		scene: 'ALOS2-WBDR-0582171340-250704-HHHV-NRB', date: '2025-07-04', site: 'TOMAKOMAI',
		geo: 'G2', rad: 'R4', channels: [['HH', 'co-polarised']], headline: 'HH',
		px_rmse: 0.22, bias: -0.15, fails: [], series: { sites: ['TOMAKOMAI'], start: '2023-04-01', end: '2025-11-15', n: 10 }
	},
	// ---- No single-scene radiometric test defined
	'alos2-palsar2-global-mosaics-rtc': {
		spec: 'NRB', domain: 'radar', abbr: 'ALOS2-MOSAIC', platform: 'ALOS-2', instrument: 'PALSAR-2', px: 25,
		scene: 'N43E141_24_sl_HH_F02DAR', date: '2024-07-01', site: 'TOMAKOMAI',
		geo: 'G2', rad: 'R0', px_rmse: 0.36, fails: [],
		rad_note: 'A mosaic combines many acquisitions, so a single-scene radiometric comparison is not defined.',
		geo_series: { start: 2016, end: 2024 },
		scene_note: 'Annual 2024 mosaic tile; the date is the mosaic reference date.'
	},
	'risat1a-eos04-india-mosaic': {
		spec: 'NRB', domain: 'radar', abbr: 'EOS04-MOSAIC', platform: 'RISAT-1A EOS-04', instrument: 'C-band SAR', px: 18,
		scene: 'EOS04_MRS_INDIA_MOSAIC_2024_T17N078E', date: '2024-12-31', site: 'SHADNAGAR',
		geo: 'G2', rad: 'R0', px_rmse: 0.45, fails: [{ id: 'gcor-geomacc-sar', reason: 'Geolocation accuracy statement missing from metadata' }],
		rad_note: 'A mosaic combines many acquisitions, so a single-scene radiometric comparison is not defined.',
		scene_note: 'Mosaic tile containing the site; the date is the mosaic reference date.'
	},
	'nrcan-rcm-pol': {
		spec: 'POL', domain: 'radar', abbr: 'RCM-POL', platform: 'RCM-1', instrument: 'C-band SAR', px: 30,
		scene: 'RCM1_OK2981512_PK2981513_1_SC30MCPB_20250622_012955_CH_CV_POL', date: '2025-06-22', site: 'ROSAMOND',
		geo: 'G2', rad: 'R0', px_rmse: 0.16, fails: [],
		rad_note: 'Polarimetric outputs need a polarimetric calibration test (for example channel imbalance), which C-QAS does not define yet.'
	},
	'opera-disp-sentinel1': {
		spec: 'INSAR', domain: 'radar', abbr: 'OPERA-DISP', platform: 'Sentinel-1A', instrument: 'C-SAR', px: 30,
		scene: 'OPERA_L3_DISP-S1_IW_F11115_VV_20240105T000000Z_20250812T000000Z_v1.0_20250820T121314Z', date: '2025-08-12', site: 'ROSAMOND',
		geo: 'G2', rad: 'R0', px_rmse: 0.11, fails: [{ id: 'prod-phasun', reason: 'Phase unwrapping method not described in the metadata' }],
		rad_note: 'InSAR displacement is validated against GNSS displacement, which C-QAS does not test yet.',
		scene_note: 'Displacement frame covering the site; the date is the last acquisition in the stack.'
	}
};

// Landsat 8 C2 SR keeps the values of the original C-QAS report mock-up.
const LANDSAT_FIXED = {
	report_id: 'DEMO-L8-001',
	productName: 'Landsat 8 Collection 2 Level-2 Surface Reflectance',
	shortName: 'Landsat 8 C2 Level-2 SR',
	findings: [
		{ requirement: 'Metadata Machine Readability', id: 'meta-memare-optical', threshold: 'Met', goal: 'Met' },
		{ requirement: 'Data Collection Time', id: 'meta-time-sr', threshold: 'Met', goal: 'Not met' },
		{ requirement: 'Spectral Bands', id: 'meta-specband', threshold: 'Met', goal: 'Met' },
		{ requirement: 'Data Access', id: 'meta-daccess', threshold: 'Not met', goal: 'Not met', reason: 'Data Access DOI not supplied' },
		{ requirement: 'No Data', id: 'pxl-pinodat', threshold: 'Met', goal: 'Met' },
		{ requirement: 'Cloud', id: 'pxl-picloud', threshold: 'Met', goal: 'Not met' },
		{ requirement: 'Measurement', id: 'rac-measur-sr', threshold: 'Met', goal: 'Not met' },
		{ requirement: 'Measurement Uncertainty', id: 'rac-muncer-sr', threshold: 'Not required', goal: 'Not met', reason: 'Product uncertainty estimate missing' },
		{ requirement: 'Geometric Correction', id: 'gcor-geocorr-sr', threshold: 'Not met', goal: 'Not assessed', reason: 'Grid / coverage evidence missing' }
	],
	findings_summary: '2 Not met: Data Access and Geometric Correction. Both have missing supporting evidence.',
	comparisons_px: [0.31, 0.45, 0.4, 0.47, 0.36, 0.42],
	radial_rmse_px: 0.42,
	matches: [96, 120],
	method_notes: 'original offsets',
	channels: [
		{ channel: 'B2', name: 'blue', difference: 0.003, uncertainty_k1: 0.004, reference_value: 0.262 },
		{ channel: 'B3', name: 'green', difference: 0.008, uncertainty_k1: 0.005, reference_value: 0.301 },
		{ channel: 'B4', name: 'red', difference: 0.006, uncertainty_k1: 0.004, reference_value: 0.334 },
		{ channel: 'B5', name: 'near infrared', difference: -0.002, uncertainty_k1: 0.006, reference_value: 0.372 }
	],
	samples: [18, 25, 7],
	rad_notes: 'spectral response matched; time gap 120 s; 150 × 150 m window',
	next_action: 'Supply the Data Access DOI and grid / coverage evidence.',
	next_actions: ['Supply the Data Access DOI.', 'Review geometric coverage, grid and uncertainty evidence.']
};

// ------------------------------------------------------------------------------------ builders

function findingsFor(cfg, r) {
	const spec = specs[cfg.spec];
	const fails = new Map((cfg.fails ?? []).map((f) => [f.id, f]));
	const checked = CHECKED[cfg.spec].map((id) => spec.requirements.find((item) => item.id === id));
	const CATEGORY = { 'general-metadata': 'metadata', 'source-metadata': 'source metadata', 'product-metadata': 'product metadata', 'per-pixel-metadata': 'per-pixel', 'radiometric-atmospheric-corrections': 'corrections', 'radiometrically-corrected-measurements': 'measurements', 'geometric-corrections': 'geometric' };
	return CHECKED[cfg.spec].map((id, index) => {
		const req = checked[index];
		if (!req) throw new Error(`${cfg.spec} has no requirement ${id}`);
		let threshold = req.threshold ? 'Met' : 'Not required';
		let reason = null;
		if (fails.has(id)) {
			if (!req.threshold) throw new Error(`${id} has no Threshold level, so it cannot be Not met at Threshold`);
			threshold = 'Not met';
			reason = fails.get(id).reason;
		}
		// Two checked requirements can share a title (e.g. ST "Measurand Uncertainty"): name the category.
		const title = checked.filter((other) => other?.title === req.title).length > 1 ? `${req.title} (${CATEGORY[req.category]})` : req.title;
		let goal = 'Not required';
		if (req.goal) {
			const roll = r.next();
			goal = threshold === 'Not met' ? (roll < 0.7 ? 'Not met' : 'Not assessed') : roll < 0.55 ? 'Met' : roll < 0.9 ? 'Not met' : 'Not assessed';
		}
		const finding = { requirement: title, id, threshold, goal };
		if (reason) finding.reason = reason;
		if (fails.get(id)?.action) Object.defineProperty(finding, 'action', { value: fails.get(id).action, enumerable: false });
		return finding;
	});
}

function summaryFor(findings) {
	const failed = findings.filter((f) => f.threshold === 'Not met');
	if (!failed.length) return 'No checked Threshold requirement is Not met.';
	const allEvidence = failed.every((f) => /missing|not supplied|not found|not recorded|not in the metadata|not described/i.test(f.reason ?? ''));
	const names = list(failed.map((f) => f.requirement));
	const evidence = failed.length === 1 ? ' It has missing supporting evidence.' : failed.length === 2 ? ' Both have missing supporting evidence.' : ' All have missing supporting evidence.';
	return `${failed.length} Not met: ${names}.${allEvidence ? evidence : ''}`;
}

function actionsFor(findings) {
	const actions = findings.filter((f) => f.threshold === 'Not met').map((f) => f.action ?? ACTIONS[f.id] ?? `Review the evidence for ${f.requirement}.`);
	const goalGap = findings.find((f) => f.threshold !== 'Not met' && f.goal === 'Not met');
	if (goalGap) actions.push(`To reach Goal, review the evidence for ${goalGap.requirement}.`);
	return [...new Set(actions)];
}

function seriesDates(r, start, end, n) {
	const a = Date.parse(`${start}T00:00:00Z`);
	const b = Date.parse(`${end}T00:00:00Z`);
	const step = (b - a) / n;
	const dates = [];
	for (let i = 0; i < n; i += 1) dates.push(day(a + step * (i + 0.5) + (r.next() - 0.5) * step * 0.6));
	return dates;
}

function runFor(cfg) {
	const spec = specs[cfg.spec];
	const specCode = `${SPEC_CODE[cfg.spec]}${spec.version.replace(/\./g, '')}`;
	const segments = [
		{ code: 'C031', part: 'Software', meaning: 'C-QAS processing software v0.3.1' },
		{ code: specCode, part: 'Check set', meaning: `${spec.title} PFS v${spec.version}` },
		{ code: cfg.geo, part: 'Geometric method', meaning: GEO[cfg.geo].meaning },
		{ code: cfg.rad, part: 'Radiometric method', meaning: RAD[cfg.rad].meaning },
		{ code: 'D01', part: 'Snapshot', meaning: 'Assessment snapshot DEMO-01' }
	];
	return { code: segments.map((s) => s.code).join('-'), snapshot: 'DEMO-01', reviewer: null, segments, note: 'Mock code. It identifies the software and settings that produced these results.' };
}

function geometricFor(cfg, r) {
	const g = GEO[cfg.geo];
	const fixed = cfg.fixed ? LANDSAT_FIXED : null;
	let comparisons;
	let rmse;
	let matches;
	if (fixed) {
		comparisons = fixed.comparisons_px;
		rmse = fixed.radial_rmse_px;
		matches = fixed.matches;
	} else {
		const n = g.kind === 'absolute' ? r.int(6, 10) : 6;
		const raw = Array.from({ length: n }, () => Math.max(0.05, 1 + 0.18 * r.normal()));
		// Scale so the radial RMSE over all comparisons is the profile's value.
		const scale = cfg.px_rmse / Math.sqrt(raw.reduce((s, v) => s + v * v, 0) / n);
		comparisons = raw.map((v) => round(v * scale, 2));
		rmse = round(Math.sqrt(comparisons.reduce((s, v) => s + v * v, 0) / n), 2);
		if (g.kind === 'absolute') matches = [n, n + (r.next() < 0.5 ? 1 : 0)];
		else {
			const total = r.int(90, 180);
			matches = [Math.round(total * r.between(0.72, 0.9)), total];
		}
	}
	const limit = g.kind === 'relative' ? 0.5 : null;
	const geocorrFail = (cfg.fails ?? []).find((f) => f.id.startsWith('gcor-'));
	const numeric = limit === null ? 'Not assessed' : rmse <= limit ? 'Met' : 'Not met';
	const requirement = geocorrFail ? 'Not met' : numeric === 'Not met' ? 'Not met' : 'Met';
	return {
		label: g.label,
		kind: g.kind,
		method: g.method,
		reference: cfg.ref?.geo ?? (g.kind === 'absolute' ? `${SITES[cfg.site].name} reflector survey` : `${cfg.platform} repeat reference image`),
		comparison: g.comparison,
		method_notes: fixed ? fixed.method_notes : g.kind === 'absolute' ? 'peak location by sinc interpolation; solid Earth tides corrected' : 'phase correlation; offsets from the original grid',
		pixel_size_m: cfg.px,
		radial_rmse_px: rmse,
		comparisons_px: comparisons,
		limit_px: limit,
		limit_source: limit === null ? null : 'PFS Threshold',
		matches_accepted: matches[0],
		matches_total: matches[1],
		match_unit: g.match_unit,
		positional_uncertainty: g.kind === 'absolute' ? `±${round(cfg.px * rmse * 0.3 + 0.4, 1)} m (k = 1)` : null,
		absolute_accuracy: g.kind === 'absolute' ? numeric : 'Not assessed',
		numeric_test: numeric,
		requirement_result: requirement,
		requirement_reason: geocorrFail ? geocorrFail.reason.charAt(0).toLowerCase() + geocorrFail.reason.slice(1) : null
	};
}

function radiometricFor(cfg, r) {
	if (cfg.rad === 'R0') return null;
	const m = RAD[cfg.rad];
	const site = SITES[cfg.site];
	const fixed = cfg.fixed ? LANDSAT_FIXED : null;
	const base = {
		label: m.label,
		method: 'demo-v1',
		comparison: m.comparison
	};
	if (cfg.domain === 'optical') {
		const channels =
			fixed?.channels ??
			cfg.channels.map(([channel, name]) => {
				const refValue = round((SITE_REFLECTANCE[name] ?? 0.4) * r.between(0.88, 1.12), 3);
				let difference = round(cfg.bias + 0.003 * r.normal(), 3);
				if (difference === 0) difference = cfg.bias < 0 ? -0.001 : 0.001; // an exact zero reads like a placeholder
				return { channel, name, difference, uncertainty_k1: round(r.between(0.004, 0.007), 3), reference_value: refValue };
			});
		const window = cfg.window_m ?? 150;
		const total = fixed ? fixed.samples[1] : Math.max(9, Math.round(window / cfg.px) ** 2);
		const used = fixed ? fixed.samples[0] : Math.round(total * r.between(0.7, 0.96));
		return {
			...base,
			reference: cfg.ref?.rad ?? (site.network === 'RadCalNet' ? `RadCalNet ${site.code} surface reflectance` : `${site.name} PICS model`),
			method_notes: fixed?.rad_notes ?? [`spectral response matched`, site.network === 'RadCalNet' ? `time gap ${r.int(30, 600)} s` : 'BRDF-normalised site model', `${window >= 1000 ? `${window / 1000} × ${window / 1000} km` : `${window} × ${window} m`} window`, cfg.extra_rad_note].filter(Boolean).join('; '),
			quantity: 'surface reflectance',
			short_quantity: 'SR',
			units: '1',
			decimals: 3,
			headline_channel: cfg.headline,
			channels,
			limit: null,
			limit_source: null,
			samples_used: used,
			samples_total: total,
			sample_unit: 'pixels in the site window',
			unique_exclusions: total - used,
			product_uncertainty: null,
			accuracy_test: 'Not assessed',
			accuracy_reason: 'no agreed limit',
			uncertainty_goal: 'Not met',
			uncertainty_goal_reason: 'product estimate missing'
		};
	}
	if (cfg.domain === 'thermal') {
		const channels = cfg.channels.map(([channel, name]) => ({ channel, name, difference: round(cfg.bias + 0.15 * r.normal(), 2), uncertainty_k1: round(r.between(0.45, 0.7), 2), reference_value: null }));
		const head = channels.find((c) => c.channel === cfg.headline);
		const limit = cfg.rad_limit ?? null;
		const total = 9;
		const used = r.int(7, 9);
		return {
			...base,
			reference: site.network === 'NASA/JPL buoys' ? `${site.name} radiometer buoys` : `${site.network}: ${site.name}`,
			method_notes: `in situ skin temperature; time gap ${r.int(2, 9)} min; emissivity from ASTER GED`,
			quantity: 'surface temperature',
			short_quantity: 'ST',
			units: 'K',
			decimals: 2,
			headline_channel: cfg.headline,
			channels,
			limit: limit?.value ?? null,
			limit_source: limit?.source ?? null,
			samples_used: used,
			samples_total: total,
			sample_unit: 'pixels around the in situ radiometer',
			unique_exclusions: total - used,
			product_uncertainty: cfg.product_uncertainty ?? null,
			accuracy_test: limit ? (Math.abs(head.difference) <= limit.value ? 'Met' : 'Not met') : 'Not assessed',
			accuracy_reason: limit ? null : 'no agreed limit',
			uncertainty_goal: cfg.product_uncertainty ? 'Met' : 'Not met',
			uncertainty_goal_reason: cfg.product_uncertainty ? null : 'product estimate missing'
		};
	}
	// radar: corner reflector radar cross-section on the co-polarised channel
	const channels = cfg.channels.map(([channel, name]) => ({ channel, name, difference: round(cfg.bias + 0.06 * r.normal(), 2), uncertainty_k1: round(r.between(0.2, 0.32), 2), reference_value: null }));
	const total = r.int(6, 10);
	const used = total - (r.next() < 0.4 ? 1 : 0);
	return {
		...base,
		reference: `${site.name} trihedral reflectors`,
		method_notes: 'integrated-energy method; signal-to-clutter ratio above 25 dB; cross-polarised channel not measurable on trihedrals',
		quantity: 'radar cross-section',
		short_quantity: 'RCS',
		units: 'dB',
		decimals: 2,
		headline_channel: cfg.headline,
		channels,
		limit: null,
		limit_source: null,
		samples_used: used,
		samples_total: total,
		sample_unit: 'corner reflectors',
		unique_exclusions: total - used,
		product_uncertainty: null,
		accuracy_test: 'Not assessed',
		accuracy_reason: 'no agreed limit',
		uncertainty_goal: 'Not assessed',
		uncertainty_goal_reason: 'no radar uncertainty requirement checked'
	};
}

function seriesFor(cfg, r, radiometric, geometric) {
	if (cfg.geo_series) {
		const values = [];
		for (let year = cfg.geo_series.start; year <= cfg.geo_series.end; year += 1) {
			const isScene = `${year}-07-01` === cfg.date;
			const value = isScene ? geometric.radial_rmse_px * cfg.px : Math.max(1, cfg.px * cfg.px_rmse * (1 + 0.2 * r.normal()));
			values.push({ date: `${year}-07-01`, site: cfg.site, value: round(value, 1), uncertainty_k1: round(r.between(1.0, 1.8), 1) });
		}
		return {
			test: 'geometric',
			description: 'Location error of each annual mosaic at the corner reflectors',
			channel: null,
			units: 'm',
			decimals: 1,
			sites: [SITES[cfg.site]],
			points: values,
			note: 'One value per annual mosaic. Zero would mean every reflector is exactly where it was surveyed.'
		};
	}
	if (!cfg.series || !radiometric) return null;
	const head = radiometric.channels.find((c) => c.channel === radiometric.headline_channel);
	const noise = { optical: 0.003, thermal: 0.35, radar: 0.12 }[cfg.domain];
	const seasonal = { optical: 0.0015, thermal: 0.25, radar: 0.05 }[cfg.domain];
	const siteOffset = Object.fromEntries(cfg.series.sites.map((code, i) => [code, i === 0 ? 0 : noise * 0.8 * r.normal()]));
	const digits = radiometric.decimals + 1;
	const points = seriesDates(r, cfg.series.start, cfg.series.end, cfg.series.n).map((date, i) => {
		const site = cfg.series.sites[i % cfg.series.sites.length];
		const phase = (Date.parse(`${date}T00:00:00Z`) / (365.25 * 86400000)) * 2 * Math.PI;
		const value = head.difference + siteOffset[site] + seasonal * Math.sin(phase) + noise * r.normal();
		return { date, site, value: round(value, digits), uncertainty_k1: round(head.uncertainty_k1 * r.between(0.85, 1.2), digits) };
	});
	// The input scene is one of the points.
	if (cfg.series.sites.includes(cfg.site)) {
		const at = points.findIndex((p) => p.date >= cfg.date);
		const scenePoint = { date: cfg.date, site: cfg.site, value: head.difference, uncertainty_k1: head.uncertainty_k1 };
		if (at === -1) points.push(scenePoint);
		else points.splice(at, 0, scenePoint);
	}
	return {
		test: 'radiometric',
		description: `${head.name.charAt(0).toUpperCase()}${head.name.slice(1)} (${head.channel}) ${radiometric.quantity} difference`,
		channel: head.channel,
		units: radiometric.units,
		decimals: radiometric.decimals,
		sites: cfg.series.sites.map((code) => SITES[code]),
		points,
		note: 'Each point is one scene over a site. Zero means the same as the reference.'
	};
}

function build(id, cfg, product) {
	const r = rng(hash(id));
	const spec = specs[cfg.spec];
	const fixed = cfg.fixed ? LANDSAT_FIXED : null;
	const findings = fixed ? fixed.findings : findingsFor(cfg, r);
	const geometric = geometricFor(cfg, r);
	const radiometric = radiometricFor(cfg, r);
	const series = seriesFor(cfg, r, radiometric, geometric);
	const actions = fixed ? fixed.next_actions : actionsFor(findings);
	const report = {
		schema: 'cqas-report/2',
		data_status: 'example',
		status_note: 'All values, scenes and dates below are made up for this mock-up to be plausible for this product. C-QAS has not run on any real scene yet; its test system is still being built.',
		report_id: fixed ? fixed.report_id : `DEMO-${cfg.abbr}-001`,
		report_date: REPORT_DATE,
		domain: cfg.domain,
		product: { explorer_id: id, name: fixed?.productName ?? product.product_name, short_name: fixed?.shortName ?? product.display_name ?? product.product_name },
		pfs: { name: spec.title, short_name: SPEC_SHORT[cfg.spec], version: spec.version, total_requirements: spec.requirements.length },
		scene: {
			product_id: cfg.scene,
			platform: cfg.platform,
			instrument: cfg.instrument,
			acquisition_date: cfg.date,
			path: cfg.path ?? null,
			row: cfg.row ?? null,
			reference_site: SITES[cfg.site],
			note: ['Example input scene chosen to illustrate the report; not a real C-QAS run.', cfg.scene_note].filter(Boolean).join(' ')
		},
		run: runFor(cfg),
		findings_scope: `${findings.length} of the ${spec.requirements.length} ${spec.title} PFS v${spec.version} requirements: the ones C-QAS is planned to check automatically from the product, its metadata and reference comparisons.`,
		findings,
		findings_summary: fixed ? fixed.findings_summary : summaryFor(findings),
		geometric,
		radiometric,
		radiometric_note: radiometric ? null : cfg.rad_note,
		series,
		next_action: fixed ? fixed.next_action : (actions[0] ?? 'No action needed for the checked Threshold requirements.'),
		next_actions: actions,
		scope_note: 'A C-QAS check describes the scenes and reference comparisons listed. It does not establish collection-wide suitability and is not a CEOS-ARD assessment.'
	};
	return report;
}

// ------------------------------------------------------------------------------------ main

const ids = catalogue.map((product) => product.id);
const missing = ids.filter((id) => !PRODUCTS[id]);
const extra = Object.keys(PRODUCTS).filter((id) => !ids.includes(id));
if (missing.length || extra.length) {
	console.error(`Profiles do not match the catalogue. Missing: ${missing.join(', ') || 'none'}. Unknown: ${extra.join(', ') || 'none'}.`);
	process.exit(1);
}
let changed = 0;
for (const product of catalogue) {
	const report = build(product.id, PRODUCTS[product.id], product);
	const file = resolve(ROOT, `data/cqas/${product.id}.json`);
	const text = `${JSON.stringify(report, null, '\t')}\n`;
	const before = existsSync(file) ? readFileSync(file, 'utf8') : null;
	if (before === text) continue;
	changed += 1;
	if (CHECK) console.error(`data/cqas/${product.id}.json is out of date.`);
	else writeFileSync(file, text);
}
if (CHECK && changed) {
	console.error('Run node tools/build_cqas_examples.mjs to regenerate.');
	process.exit(1);
}
console.log(CHECK ? 'C-QAS example reports are up to date.' : `Wrote ${changed} C-QAS example report${changed === 1 ? '' : 's'} (${catalogue.length} products).`);
