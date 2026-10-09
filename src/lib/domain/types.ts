/**
 * Typed domain models. Field names intentionally match the version-controlled
 * catalogue JSON and the legacy Python dataclasses (snake_case), so records can be
 * compared field-for-field with the Python parity fixtures.
 */

export type CriterionMode = 'required' | 'preferred' | 'not_used';
export type CriterionState = 'met' | 'outside' | 'unknown' | 'not_used';

export const CRITERION_NAMES = [
	'spatial_resolution_m',
	'revisit_days',
	'radiometric_bit_depth',
	'geographic_coverage'
] as const;
export type CriterionName = (typeof CRITERION_NAMES)[number];

export type CriterionValue = number | string;

export interface CriterionSetting {
	mode?: CriterionMode | string;
	value?: CriterionValue | null;
}

/** Criteria keyed by name. Insertion order matters: it fixes summary wording order. */
export type Criteria = Record<string, CriterionSetting>;

export type CeosFilter =
	| 'CEOS-ARD assessed only'
	| 'All statuses'
	| 'Assessment in progress'
	| 'Not assessed or status unknown';

export interface Product {
	id: string;
	product_name: string;
	official_product_name: string | null;
	display_name: string | null;
	ceos_ard_assessment_id: string | null;
	mission_name: string | null;
	family: string;
	provider: string | null;
	product_family: string | null;
	spatial_resolution_m: number | null;
	spatial_resolution_options_m: number[];
	spatial_resolution_display: string | null;
	spatial_resolution_basis: string;
	instrument_spatial_resolution_best_m: number | null;
	instrument_spatial_resolution_display: string | null;
	instrument_resolution_note: string | null;
	revisit_days: number | null;
	revisit_display: string | null;
	revisit_basis: string;
	product_update_frequency_days: number | null;
	product_update_frequency_display: string | null;
	radiometric_bit_depth: number | null;
	radiometric_bit_depth_display: string | null;
	bit_depth_basis: string;
	output_storage_bit_depth: number | null;
	output_storage_display: string | null;
	output_data_type: string | null;
	geographic_coverage: string;
	geographic_coverage_display: string | null;
	coverage_basis: string;
	swath_width: string | null;
	operational_status: string | null;
	atmospheric_correction: string | null;
	elevation_model: string | null;
	coordinate_system: string | null;
	data_format: string | null;
	launch_or_start_year: number | null;
	sensor_or_instrument_type: string | null;
	ceos_ard_status: string;
	ceos_ard_verified: boolean;
	ceos_ard_pfs: string | null;
	ceos_ard_assessment_level: string | null;
	ceos_ard_record_url: string | null;
	pfs_type: string | null;
	pfs_version: string | null;
	approval_date: string | null;
	agency: string | null;
	missions: string[];
	instruments: string[];
	ard_tier: string | null;
	ard_tier_display: string | null;
	ard_tier_notes: string | null;
	geometric_accuracy_display: string | null;
	geometric_accuracy_metric: string | null;
	geometric_accuracy_value: number | null;
	geometric_accuracy_unit: string | null;
	radiometric_accuracy_display: string | null;
	radiometric_accuracy_metric: string | null;
	radiometric_accuracy_value: number | null;
	radiometric_accuracy_unit: string | null;
	access_url: string | null;
	information_url: string | null;
	self_assessment_url: string | null;
	peer_review_url: string | null;
	sample_product_url: string | null;
	existing_demo_record_ids: string[];
	source_type: string;
	source_url: string | null;
	notes: string | null;
}

export interface Profile {
	id: string;
	name: string;
	description: string;
	use_case_category: string;
	product_families: string[];
	criteria: Criteria;
	default_product_family: string | null;
	filter_defaults: { ceos_filter?: string; show_unknown?: boolean; [key: string]: unknown };
	radiometric_screening: string;
	geometric_screening: string;
	notes: string | null;
	assumptions: string | null;
	built_in: boolean;
}

export interface MatchResult {
	product: Product;
	group: string;
	states: Record<string, CriterionState>;
	preferred_met: number;
	unknown_count: number;
	summary: string;
}

/** Field-level research-log evidence for a curated record. */
export interface ProvenanceRow {
	product_id: string;
	field_name: string;
	recorded_value: string;
	source_title: string;
	source_url: string;
	source_type: string;
	evidence_level: string;
	confidence: string;
	notes: string;
	date_checked: string;
}

export type ProvenanceIndex = Record<string, Record<string, ProvenanceRow>>;
