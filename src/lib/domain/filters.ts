/**
 * Metadata filtering (explicitly active filters only), ported from legacy `app.py`
 * `metadata_filter`, plus plain-language exclusion reasons for shortlisted records.
 */
import { casefold } from './text';
import type { CeosFilter, Criteria, Product } from './types';

export const ALL_FAMILIES = 'All product families';

export const CEOS_FILTERS: CeosFilter[] = [
	'CEOS-ARD assessed only',
	'All statuses',
	'Assessment in progress',
	'Not assessed or status unknown'
];

export interface MetadataFilterState {
	family: string;
	search: string;
	ceosFilter: CeosFilter;
	providers: string[];
	sensor: string;
	operationalStatuses: string[];
	sources: string[];
	/** Prototype "Keep records with unreported values" (true = keep). */
	showUnknown: boolean;
	/** Which screening criteria are active (mode required or preferred) — used only by hide-unknown. */
	active: { spatial: boolean; revisit: boolean; bitDepth: boolean; coverage: boolean };
	/**
	 * Legacy launch/dataset-start-year cut-off. **Not used by the rebuilt interface.**
	 * When a number is supplied, the prototype's two launch-year clauses are applied
	 * exactly (including hiding unknown years when unreported values are not kept).
	 */
	legacyLaunchYear?: number;
}

export const NEUTRAL_FILTERS: MetadataFilterState = {
	family: ALL_FAMILIES,
	search: '',
	ceosFilter: 'CEOS-ARD assessed only',
	providers: [],
	sensor: '',
	operationalStatuses: [],
	sources: [],
	showUnknown: true,
	active: { spatial: false, revisit: false, bitDepth: false, coverage: false }
};

export function activeFromCriteria(criteria: Criteria): MetadataFilterState['active'] {
	const on = (name: string) => {
		const mode = criteria[name]?.mode;
		return mode === 'required' || mode === 'preferred';
	};
	return {
		spatial: on('spatial_resolution_m'),
		revisit: on('revisit_days'),
		bitDepth: on('radiometric_bit_depth'),
		coverage: on('geographic_coverage') && criteria.geographic_coverage?.value !== 'No requirement'
	};
}

export type ExclusionKind = 'family' | 'scope' | 'search' | 'provider' | 'sensor' | 'operational' | 'source' | 'launch-year' | 'unreported';

export interface Exclusion {
	kind: ExclusionKind;
	reason: string;
}

/** Every metadata filter that excludes the product, in the prototype's evaluation order. */
export function exclusions(product: Product, state: MetadataFilterState): Exclusion[] {
	const result: Exclusion[] = [];
	const search = casefold(state.search).trim();
	const sensor = casefold(state.sensor).trim();
	if (state.family !== ALL_FAMILIES && product.product_family !== state.family) {
		result.push({ kind: 'family', reason: `Measurement family is ${product.product_family ?? 'not reported'}, not ${state.family}.` });
	}
	if (state.ceosFilter === 'CEOS-ARD assessed only' && !product.ceos_ard_verified) {
		result.push({ kind: 'scope', reason: 'Not marked CEOS-ARD assessed; the scope is limited to assessed products.' });
	}
	if (state.ceosFilter === 'Assessment in progress' && product.ceos_ard_status !== 'Assessment in progress') {
		result.push({ kind: 'scope', reason: 'Not marked "Assessment in progress"; the scope is limited to assessments in progress.' });
	}
	if (state.ceosFilter === 'Not assessed or status unknown' && product.ceos_ard_verified) {
		result.push({ kind: 'scope', reason: 'Marked CEOS-ARD assessed; the scope is limited to products not assessed or of unknown status.' });
	}
	if (search && !casefold(`${product.product_name} ${product.mission_name || ''}`).includes(search)) {
		result.push({ kind: 'search', reason: `Product and mission names do not contain “${state.search.trim()}”.` });
	}
	if (state.providers.length && !state.providers.includes(product.provider as string)) {
		result.push({ kind: 'provider', reason: `Provider ${product.provider ?? 'not reported'} is not among the selected providers.` });
	}
	if (sensor && !casefold(product.sensor_or_instrument_type || '').includes(sensor)) {
		result.push({ kind: 'sensor', reason: `Sensor or instrument type does not contain “${state.sensor.trim()}”.` });
	}
	if (state.operationalStatuses.length && !state.operationalStatuses.includes(product.operational_status as string)) {
		result.push({ kind: 'operational', reason: `Operational status ${product.operational_status ?? 'not reported'} is not selected.` });
	}
	if (state.sources.length && !state.sources.includes(product.source_type)) {
		result.push({ kind: 'source', reason: 'Record source is not among the selected sources.' });
	}
	const legacy = state.legacyLaunchYear;
	if (legacy !== undefined && product.launch_or_start_year !== null && product.launch_or_start_year < legacy) {
		result.push({ kind: 'launch-year', reason: `Launch or start year ${product.launch_or_start_year} is before ${legacy}.` });
	}
	if (!state.showUnknown) {
		const missing: string[] = [];
		if (state.active.spatial && product.spatial_resolution_m === null) missing.push('spatial resolution');
		if (state.active.revisit && product.revisit_days === null) missing.push('nominal revisit');
		if (state.active.bitDepth && product.radiometric_bit_depth === null) missing.push('radiometric bit depth');
		if (state.active.coverage && product.geographic_coverage === 'Unknown') missing.push('geographic coverage');
		if (legacy !== undefined && product.launch_or_start_year === null) missing.push('launch or start year');
		if (missing.length) {
			result.push({ kind: 'unreported', reason: `Hidden because unreported values are excluded: ${missing.join(', ')}.` });
		}
	}
	return result;
}

/** Port of `metadata_filter`: keep products that no active metadata filter excludes. */
export function metadataFilter(products: Product[], state: MetadataFilterState): Product[] {
	return products.filter((product) => exclusions(product, state).length === 0);
}
