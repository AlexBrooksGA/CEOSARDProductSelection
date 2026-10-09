/**
 * Short, source-linked explanations. Definitions only — no product recommendations,
 * official-looking domain thresholds or suitability claims.
 */
import { ALL_FAMILIES } from './filters';

export const CEOS_ARD_URL = 'https://ceos.org/ard/';
export const CEOS_ARD_USER_GUIDE_URL = 'https://ceos.org/ard/files/User%20Guide/CEOS_ARD%20User%20Guide%20v1_4.pdf';
export const ARSET_RADAR_URL = 'https://appliedsciences.nasa.gov/get-involved/training/english/arset-radar-remote-sensing-land-water-disaster-applications';

export interface FamilyInfo {
	value: string;
	label: string;
	short: string;
	icon: string;
	slug: string;
	explanation: string;
}

/** Display labels keep current PFS names without changing internal filter values. */
export const FAMILIES: FamilyInfo[] = [
	{
		value: 'Surface Reflectance',
		label: 'Surface Reflectance',
		short: 'SR',
		icon: 'SR',
		slug: 'surface-reflectance',
		explanation: 'Optical measurements of sunlight reflected by the land surface, after correction for atmospheric effects. Clouds and darkness limit observations.'
	},
	{
		value: 'Surface Temperature',
		label: 'Surface Temperature',
		short: 'ST',
		icon: 'ST',
		slug: 'surface-temperature',
		explanation: 'Thermal-infrared measurements expressed as land surface temperature.'
	},
	{
		value: 'Synthetic Aperture Radar',
		label: 'Combined CEOS-ARD for Synthetic Aperture Radar',
		short: 'SAR',
		icon: 'SAR',
		slug: 'synthetic-aperture-radar',
		explanation: 'Radar measurements that can be acquired day or night and through cloud. Includes normalised radar backscatter (NRB), polarimetric (POL) and interferometric (InSAR) products.'
	},
	{
		value: 'Aquatic Reflectance',
		label: 'Aquatic Reflectance',
		short: 'AR',
		icon: 'AR',
		slug: 'aquatic-reflectance',
		explanation: 'Optical reflectance of water bodies, corrected for the atmosphere and the water surface.'
	},
	{
		value: 'Night-time Lights',
		label: 'Nighttime Lights Surface Radiance',
		short: 'NTL',
		icon: 'NTL',
		slug: 'night-time-lights',
		explanation: 'Measurements of light emitted from the Earth’s surface at night.'
	}
];

export const FAMILY_BY_VALUE: Record<string, FamilyInfo> = Object.fromEntries(FAMILIES.map((family) => [family.value, family]));

export function familyLabel(value: string | null | undefined): string {
	if (!value) return 'Measurement family not reported';
	if (value === ALL_FAMILIES) return 'All measurement families';
	return FAMILY_BY_VALUE[value]?.label ?? value;
}

export function familyVisual(value: string | null | undefined): { slug: string; icon: string; label: string } {
	const family = value ? FAMILY_BY_VALUE[value] : undefined;
	return family ? { slug: family.slug, icon: family.icon, label: family.label } : { slug: 'other', icon: 'EO', label: value || 'Other Earth observation' };
}

export interface GlossaryTerm {
	id: string;
	term: string;
	definition: string;
	source?: { label: string; url: string };
}

export const GLOSSARY: GlossaryTerm[] = [
	{
		id: 'ceos',
		term: 'CEOS',
		definition: 'Committee on Earth Observation Satellites — coordinates civil space-based Earth observation across agencies. It is not a data supplier or a suitability assessor.'
	},
	{
		id: 'ceos-ard',
		term: 'CEOS-ARD assessed',
		definition: 'CEOS Analysis Ready Data: the product has been reviewed against a named Product Family Specification through provider self-assessment and CEOS peer review. It does not certify suitability for a particular application.',
		source: { label: 'CEOS-ARD', url: CEOS_ARD_URL }
	},
	{
		id: 'pfs',
		term: 'Product Family Specification (PFS)',
		definition: 'The CEOS-ARD requirements for one measurement family. The PFS version is the specification’s version, not the product’s processing version.',
		source: { label: 'CEOS-ARD user guide', url: CEOS_ARD_USER_GUIDE_URL }
	},
	{
		id: 'threshold-goal',
		term: 'Threshold and Goal',
		definition: 'PFS requirement levels (Goal replaced the earlier term Target). They are not your Required/Preferred screening choices.',
		source: { label: 'CEOS-ARD user guide', url: CEOS_ARD_USER_GUIDE_URL }
	},
	{
		id: 'required-preferred',
		term: 'Required, Preferred and Ignore',
		definition: 'Your screening choices. Required criteria separate products that meet reported values from those needing a manual check; Preferred criteria only affect order; Ignore keeps a value without using it.'
	},
	{
		id: 'self-assessment',
		term: 'Self-assessment and peer review',
		definition: 'The provider documents conformance with the PFS (self-assessment); CEOS Working Group on Calibration and Validation (WGCV) experts review it (peer review).'
	},
	{
		id: 'spatial-resolution',
		term: 'Spatial resolution',
		definition: 'Reported spatial detail, in metres. It is not positional, survey-grade or cadastral accuracy. Product grid and instrument resolution can differ.'
	},
	{
		id: 'nominal-revisit',
		term: 'Nominal revisit',
		definition: 'An expected observation opportunity. It is not guaranteed usable or cloud-free imagery, product update frequency, delivery time or latency.'
	},
	{
		id: 'update-frequency',
		term: 'Product update frequency',
		definition: 'How often the provider publishes or updates the product, when reported. Separate from revisit.'
	},
	{
		id: 'record-period',
		term: 'Observation record period',
		definition: 'The span of dates for which observations exist. Not established in this catalogue; mission age does not indicate continuity.'
	},
	{
		id: 'coverage',
		term: 'Reported coverage',
		definition: 'A broad description of where the product is produced (Local to Global). It does not prove observations exist for your area or period.'
	},
	{
		id: 'bit-depth',
		term: 'Radiometric bit depth and output storage',
		definition: 'Bit depth describes available digital levels; output storage (for example a 16-bit file) is file encoding. Neither alone determines radiometric quality.'
	},
	{
		id: 'accuracy',
		term: 'Geometric and radiometric accuracy',
		definition: 'Positional agreement and measurement agreement with references. Values are sparse; missing evidence does not mean poor quality, and different metrics are not directly comparable.'
	},
	{
		id: 'mim',
		term: 'MIM',
		definition: 'CEOS Missions, Instruments and Measurements database. Optional MIM product records can be loaded alongside the curated catalogue; they are labelled separately.'
	},
	{
		id: 'sar-types',
		term: 'NRB, RTC, POL, InSAR',
		definition: 'SAR product types: normalised radar backscatter, radiometric terrain correction, polarimetric and interferometric products.',
		source: { label: 'NASA ARSET radar training', url: ARSET_RADAR_URL }
	},
	{
		id: 'dem-crs',
		term: 'DEM and CRS',
		definition: 'Digital elevation model used in processing, and the coordinate reference system of the delivered product.'
	}
];
