/**
 * Catalogue and profile normalisation, validation and deduplication.
 *
 * Ported from legacy `models.py` (`Product.from_dict`, `Profile.from_dict`) and
 * `catalogue.py` (`load_products`, `load_profiles`, `deduplicate_products`).
 * Pure functions: no file system, network or browser storage.
 */
import { isPresent } from './text';
import type { Product, Profile } from './types';

export class CatalogueError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CatalogueError';
	}
}

export const PRODUCT_DEFAULTS: Product = {
	id: '',
	product_name: '',
	official_product_name: null,
	display_name: null,
	ceos_ard_assessment_id: null,
	mission_name: null,
	family: 'Other',
	provider: null,
	product_family: null,
	spatial_resolution_m: null,
	spatial_resolution_options_m: [],
	spatial_resolution_display: null,
	spatial_resolution_basis: 'unknown',
	instrument_spatial_resolution_best_m: null,
	instrument_spatial_resolution_display: null,
	instrument_resolution_note: null,
	revisit_days: null,
	revisit_display: null,
	revisit_basis: 'unknown',
	product_update_frequency_days: null,
	product_update_frequency_display: null,
	radiometric_bit_depth: null,
	radiometric_bit_depth_display: null,
	bit_depth_basis: 'unknown',
	output_storage_bit_depth: null,
	output_storage_display: null,
	output_data_type: null,
	geographic_coverage: 'Unknown',
	geographic_coverage_display: null,
	coverage_basis: 'unknown',
	swath_width: null,
	operational_status: null,
	atmospheric_correction: null,
	elevation_model: null,
	coordinate_system: null,
	data_format: null,
	launch_or_start_year: null,
	sensor_or_instrument_type: null,
	ceos_ard_status: 'Status unknown',
	ceos_ard_verified: false,
	ceos_ard_pfs: null,
	ceos_ard_assessment_level: null,
	ceos_ard_record_url: null,
	pfs_type: null,
	pfs_version: null,
	approval_date: null,
	agency: null,
	missions: [],
	instruments: [],
	ard_tier: null,
	ard_tier_display: null,
	ard_tier_notes: null,
	geometric_accuracy_display: null,
	geometric_accuracy_metric: null,
	geometric_accuracy_value: null,
	geometric_accuracy_unit: null,
	radiometric_accuracy_display: null,
	radiometric_accuracy_metric: null,
	radiometric_accuracy_value: null,
	radiometric_accuracy_unit: null,
	access_url: null,
	information_url: null,
	self_assessment_url: null,
	peer_review_url: null,
	sample_product_url: null,
	existing_demo_record_ids: [],
	source_type: 'Curated demo record',
	source_url: null,
	notes: null
};

export const PRODUCT_FIELDS = Object.keys(PRODUCT_DEFAULTS) as (keyof Product)[];

const NUMBER_FIELDS = new Set<keyof Product>([
	'spatial_resolution_m',
	'instrument_spatial_resolution_best_m',
	'revisit_days',
	'product_update_frequency_days',
	'radiometric_bit_depth',
	'output_storage_bit_depth',
	'launch_or_start_year',
	'geometric_accuracy_value',
	'radiometric_accuracy_value'
]);
const LIST_FIELDS = new Set<keyof Product>([
	'spatial_resolution_options_m',
	'missions',
	'instruments',
	'existing_demo_record_ids'
]);
const BOOLEAN_FIELDS = new Set<keyof Product>(['ceos_ard_verified']);
/** Fields whose dataclass default is a non-null string. */
const REQUIRED_STRING_FIELDS = new Set<keyof Product>([
	'id',
	'product_name',
	'family',
	'spatial_resolution_basis',
	'revisit_basis',
	'bit_depth_basis',
	'geographic_coverage',
	'coverage_basis',
	'ceos_ard_status',
	'source_type'
]);

/** Stable product identifiers: curated kebab-case IDs and `mim-product:<id>`. */
export const PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function typeErrors(record: Record<string, unknown>): string[] {
	const errors: string[] = [];
	for (const field of PRODUCT_FIELDS) {
		if (!(field in record)) continue;
		const value = record[field];
		if (NUMBER_FIELDS.has(field)) {
			if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) errors.push(`${field} must be a number or null`);
		} else if (LIST_FIELDS.has(field)) {
			const itemType = field === 'spatial_resolution_options_m' ? 'number' : 'string';
			if (!Array.isArray(value) || value.some((item) => typeof item !== itemType)) errors.push(`${field} must be a list of ${itemType}s`);
		} else if (BOOLEAN_FIELDS.has(field)) {
			if (typeof value !== 'boolean') errors.push(`${field} must be true or false`);
		} else if (REQUIRED_STRING_FIELDS.has(field)) {
			if (typeof value !== 'string') errors.push(`${field} must be text`);
		} else if (value !== null && typeof value !== 'string') {
			errors.push(`${field} must be text or null`);
		}
	}
	return errors;
}

/**
 * Port of `Product.from_dict`: derive defaults exactly as the prototype did and ignore
 * harmless future fields. Unlike the prototype, field types are also validated so a
 * malformed catalogue fails clearly rather than producing an unusable record.
 */
export function normaliseProduct(input: Record<string, unknown>): Product {
	const value: Record<string, unknown> = { ...input };
	const name = [value.product_name, value.display_name, value.official_product_name].find((candidate) => isPresent(candidate) && candidate !== false && candidate !== 0);
	if (typeof name !== 'string' || !name.trim()) {
		throw new CatalogueError('product_name is required');
	}
	value.product_name = name.trim();
	const missions = value.missions ?? [];
	if (!Array.isArray(missions) || missions.some((item) => typeof item !== 'string')) {
		throw new CatalogueError('missions must be a list of strings');
	}
	const setDefault = (key: string, fallback: unknown) => {
		if (!(key in value)) value[key] = fallback;
	};
	setDefault('mission_name', (missions as string[]).join(', ') || null);
	setDefault('revisit_days', value.nominal_revisit_days);
	setDefault('revisit_display', value.nominal_revisit_display);
	setDefault('ceos_ard_pfs', [value.pfs_type, value.pfs_version].filter((part) => isPresent(part) && part !== false && part !== 0).join(' ') || null);
	setDefault('ceos_ard_assessment_level', isPresent(value.ard_tier_display) ? value.ard_tier_display : (value.ard_tier ?? null));
	setDefault('ceos_ard_record_url', value.information_url);
	setDefault('source_url', value.information_url);

	const record: Record<string, unknown> = {};
	for (const field of PRODUCT_FIELDS) {
		if (field in value) record[field] = value[field] === undefined ? null : value[field];
	}
	if (!('id' in record)) throw new CatalogueError('id is required');
	const errors = typeErrors(record);
	if (errors.length) throw new CatalogueError(errors.join('; '));
	return structuredClone({ ...PRODUCT_DEFAULTS, ...record }) as Product;
}

export interface CatalogueSources {
	/** Parsed `data/ceos_ard_products.json`, or undefined when the file is absent. */
	researched?: unknown;
	/** Parsed `data/demo_products.json` (fallback only). */
	demo?: unknown;
	/** Parsed `data/ceos_ard_status.json` (fallback overlay only). */
	status?: unknown;
}

export interface CatalogueLoadResult {
	products: Product[];
	source: 'researched' | 'demo-fallback';
	/** Non-fatal structural notes (records skipped exactly as the prototype skipped them). */
	warnings: string[];
}

/** Port of `catalogue.load_products` including source precedence and the status overlay. */
export function loadCatalogue(sources: CatalogueSources): CatalogueLoadResult {
	let raw: unknown;
	let statusMap: Record<string, unknown> = {};
	let source: CatalogueLoadResult['source'];
	if (sources.researched !== undefined) {
		raw = sources.researched;
		source = 'researched';
	} else {
		if (sources.demo === undefined) throw new CatalogueError('Required data file is missing: demo_products.json');
		if (sources.status === undefined) throw new CatalogueError('Required data file is missing: ceos_ard_status.json');
		raw = sources.demo;
		statusMap = sources.status && typeof sources.status === 'object' && !Array.isArray(sources.status) ? (sources.status as Record<string, unknown>) : {};
		source = 'demo-fallback';
	}
	if (!Array.isArray(raw)) throw new CatalogueError('Catalogue data has an unexpected top-level structure.');

	const products: Product[] = [];
	const warnings: string[] = [];
	const seen = new Set<string>();
	raw.forEach((item, index) => {
		if (!item || typeof item !== 'object' || Array.isArray(item) || !isPresent((item as Record<string, unknown>).id)) {
			warnings.push(`Skipped catalogue entry at index ${index}: it is not a record with an id.`);
			return;
		}
		const productId = String((item as Record<string, unknown>).id);
		if (seen.has(productId)) throw new CatalogueError(`Duplicate product identifier: ${productId}`);
		seen.add(productId);
		if (!PRODUCT_ID_PATTERN.test(productId)) throw new CatalogueError(`Product identifier is not a stable ID: ${productId}`);
		const merged: Record<string, unknown> = { ...(item as Record<string, unknown>) };
		const overlay = statusMap[productId];
		if (overlay && typeof overlay === 'object' && !Array.isArray(overlay)) Object.assign(merged, overlay);
		try {
			products.push(normaliseProduct(merged));
		} catch (error) {
			const detail = error instanceof Error ? error.message : 'invalid record';
			throw new CatalogueError(`Product record ${productId} is invalid: ${detail}.`);
		}
	});
	return { products, source, warnings };
}

const PROFILE_DEFAULTS = {
	default_product_family: null,
	filter_defaults: {},
	radiometric_screening: 'PFS baseline',
	geometric_screening: 'Manual task check',
	notes: null,
	assumptions: null,
	built_in: true
};
const PROFILE_REQUIRED = ['id', 'name', 'description', 'use_case_category', 'product_families', 'criteria'] as const;
const PROFILE_FIELDS = [...PROFILE_REQUIRED, ...Object.keys(PROFILE_DEFAULTS)];

/** Port of `Profile.from_dict` with structural validation. */
export function normaliseProfile(input: Record<string, unknown>): Profile {
	for (const key of PROFILE_REQUIRED) {
		if (!(key in input)) throw new CatalogueError(`${key} is required`);
	}
	const record: Record<string, unknown> = { ...PROFILE_DEFAULTS };
	for (const key of PROFILE_FIELDS) if (key in input) record[key] = input[key];
	if (typeof record.id !== 'string' || typeof record.name !== 'string') throw new CatalogueError('id and name must be text');
	if (!Array.isArray(record.product_families)) throw new CatalogueError('product_families must be a list');
	if (!record.criteria || typeof record.criteria !== 'object' || Array.isArray(record.criteria)) throw new CatalogueError('criteria must be an object');
	if (!record.filter_defaults || typeof record.filter_defaults !== 'object') throw new CatalogueError('filter_defaults must be an object');
	return structuredClone(record) as unknown as Profile;
}

/** Port of `catalogue.load_profiles`. */
export function loadProfiles(raw: unknown): Profile[] {
	if (!Array.isArray(raw)) throw new CatalogueError('Profile data has an unexpected top-level structure.');
	const profiles: Profile[] = [];
	const seen = new Set<string>();
	raw.forEach((item, index) => {
		if (!item || typeof item !== 'object' || Array.isArray(item)) return;
		try {
			const profile = normaliseProfile(item as Record<string, unknown>);
			if (seen.has(profile.id)) throw new CatalogueError(`duplicate profile identifier ${profile.id}`);
			seen.add(profile.id);
			profiles.push(profile);
		} catch (error) {
			const detail = error instanceof Error ? error.message : 'invalid record';
			throw new CatalogueError(`Profile record at index ${index} is invalid: ${detail}.`);
		}
	});
	return profiles;
}

/** Port of `deduplicate_products`: stable-ID deduplication, first occurrence wins, no fuzzy merging. */
export function deduplicateProducts<T extends { id: string }>(products: T[]): T[] {
	const seen = new Set<string>();
	const result: T[] = [];
	for (const product of products) {
		if (!seen.has(product.id)) {
			seen.add(product.id);
			result.push(product);
		}
	}
	return result;
}
