/**
 * Consistent, labelled product facts for summaries, details and comparison.
 * The same fact always carries the same label, unit, basis and missing-state wording.
 * Presentation only: nothing here feeds matching.
 */
import { formatG } from './text';
import type { Product, ProvenanceRow } from './types';

export const MIM_SOURCE_TYPE = 'MIM API product';

export function isMimRecord(product: Pick<Product, 'source_type'>): boolean {
	return product.source_type.toLowerCase().startsWith('mim api');
}

export type MissingKind = 'not-established' | 'not-found-in-checked-sources' | 'not-reported-by-mim' | 'not-checked-for-area' | 'not-applicable';

export interface Fact {
	label: string;
	/** Display text, or null when the value is missing. */
	value: string | null;
	/** Plain-language basis, e.g. "Product-level value". */
	basis?: string | null;
	note?: string | null;
	missing?: { kind: MissingKind; text: string } | null;
	/** True when the value is shown for context only and is never used for matching. */
	displayOnly?: boolean;
}

const BASIS_LABELS: Record<string, string> = {
	product: 'Product-level value',
	mission: 'Mission-level value',
	constellation: 'Constellation-level value',
	instrument: 'Instrument-level value',
	output_product: 'Product output encoding',
	source_instrument: 'Source-instrument value',
	unknown: 'Basis not established'
};

export function basisLabel(basis: string | null | undefined): string | null {
	if (!basis) return null;
	return BASIS_LABELS[basis] ?? basis;
}

/**
 * Missing-state wording. A research-log row marked `not_found` means sources were checked
 * and no value was located; an unexplained null is "not established in this catalogue".
 */
export function missingState(product: Product, field: string, provenance?: Record<string, ProvenanceRow>): { kind: MissingKind; text: string } {
	if (isMimRecord(product)) return { kind: 'not-reported-by-mim', text: 'Not reported in the MIM record' };
	const row = provenance?.[field];
	if (row && row.confidence === 'not_found') {
		return { kind: 'not-found-in-checked-sources', text: `Not found in the sources checked (catalogue checked ${row.date_checked})` };
	}
	return { kind: 'not-established', text: 'Not established in this catalogue' };
}

function text(value: unknown): string | null {
	if (value === null || value === undefined || value === '' || value === 'Unknown') return null;
	return String(value);
}

export function spatialFact(product: Product, provenance?: Record<string, ProvenanceRow>): Fact {
	if (product.spatial_resolution_m !== null || product.spatial_resolution_display) {
		const value = product.spatial_resolution_display ?? `${formatG(product.spatial_resolution_m!)} m`;
		const options = product.spatial_resolution_options_m.length > 1 ? `Variants: ${product.spatial_resolution_options_m.map((v) => `${formatG(v)} m`).join(', ')}` : null;
		return { label: 'Spatial resolution', value, basis: basisLabel(product.spatial_resolution_basis), note: options };
	}
	if (product.instrument_spatial_resolution_best_m !== null && product.instrument_spatial_resolution_display) {
		return {
			label: 'Finest instrument resolution',
			value: product.instrument_spatial_resolution_display,
			basis: 'Instrument-level value — display fallback',
			note: 'Shown because the product record reports no product-level resolution. Not used for product matching.',
			displayOnly: true
		};
	}
	const options = product.spatial_resolution_options_m.length ? `Variants: ${product.spatial_resolution_options_m.map((v) => `${formatG(v)} m`).join(', ')} (no single product value)` : null;
	return { label: 'Spatial resolution', value: null, note: options, missing: missingState(product, 'spatial_resolution_m', provenance) };
}

export function instrumentResolutionFact(product: Product): Fact {
	return {
		label: 'Finest reported instrument resolution',
		value: text(product.instrument_spatial_resolution_display),
		note: product.instrument_resolution_note,
		basis: product.instrument_spatial_resolution_display ? 'Instrument-level value (not product resolution)' : null,
		displayOnly: true,
		missing: product.instrument_spatial_resolution_display ? null : { kind: 'not-established', text: isMimRecord(product) ? 'Not reported in the MIM record' : 'Not recorded for this curated record' }
	};
}

export function revisitFact(product: Product, provenance?: Record<string, ProvenanceRow>): Fact {
	const value = product.revisit_display ?? (product.revisit_days !== null ? `${formatG(product.revisit_days)} days` : null);
	return {
		label: 'Nominal revisit',
		value,
		basis: value ? basisLabel(product.revisit_basis) : null,
		missing: value ? null : missingState(product, 'nominal_revisit_days', provenance)
	};
}

export function updateFrequencyFact(product: Product, provenance?: Record<string, ProvenanceRow>): Fact {
	const value = product.product_update_frequency_display ?? (product.product_update_frequency_days !== null ? `${formatG(product.product_update_frequency_days)} days` : null);
	return { label: 'Product update frequency', value, missing: value ? null : missingState(product, 'product_update_frequency_display', provenance) };
}

export function observationPeriodFact(): Fact {
	return {
		label: 'Observation record period',
		value: null,
		missing: { kind: 'not-established', text: 'Not established in this catalogue — check the provider archive' }
	};
}

export function coverageFact(product: Product, provenance?: Record<string, ProvenanceRow>): Fact {
	const category = text(product.geographic_coverage);
	const detail = text(product.geographic_coverage_display);
	return {
		label: 'Reported coverage',
		value: category ? (detail && detail !== category ? `${category} — ${detail}` : category) : detail,
		basis: category || detail ? basisLabel(product.coverage_basis) : null,
		missing: category || detail ? null : missingState(product, 'geographic_coverage', provenance)
	};
}

export function localAvailabilityFact(): Fact {
	return {
		label: 'Availability for your area and period',
		value: null,
		missing: { kind: 'not-checked-for-area', text: 'Not checked for your area and period — use the provider access portal' }
	};
}

/** Prototype precedence: radiometric bit depth, else output storage, else bit-depth note. */
export function bitDepthFact(product: Product, provenance?: Record<string, ProvenanceRow>): Fact {
	if (product.radiometric_bit_depth !== null) {
		return { label: 'Radiometric bit depth', value: product.radiometric_bit_depth_display ?? `${product.radiometric_bit_depth}-bit`, basis: basisLabel(product.bit_depth_basis) };
	}
	if (product.output_storage_display || product.output_storage_bit_depth !== null) {
		return {
			label: 'Output storage',
			value: product.output_storage_display ?? `${product.output_storage_bit_depth}-bit`,
			note: 'File encoding, not radiometric resolution or quality.',
			basis: basisLabel(product.bit_depth_basis)
		};
	}
	if (product.radiometric_bit_depth_display) {
		return { label: 'Radiometric bit depth note', value: product.radiometric_bit_depth_display };
	}
	return { label: 'Radiometric bit depth', value: null, missing: missingState(product, 'radiometric_bit_depth', provenance) };
}

export function radiometricBitDepthFact(product: Product, provenance?: Record<string, ProvenanceRow>): Fact {
	const value = product.radiometric_bit_depth !== null ? `${product.radiometric_bit_depth}-bit` : null;
	return {
		label: 'Radiometric bit depth',
		value,
		note: product.radiometric_bit_depth_display,
		basis: value ? basisLabel(product.bit_depth_basis) : null,
		missing: value ? null : missingState(product, 'radiometric_bit_depth', provenance)
	};
}

export function outputEncodingFact(product: Product, provenance?: Record<string, ProvenanceRow>): Fact {
	const parts = [product.output_storage_display ?? (product.output_storage_bit_depth !== null ? `${product.output_storage_bit_depth}-bit` : null), product.output_data_type].filter(Boolean);
	return {
		label: 'Output encoding',
		value: parts.length ? parts.join(' · ') : null,
		note: parts.length ? 'Storage encoding, not radiometric quality.' : null,
		missing: parts.length ? null : missingState(product, 'output_storage_bit_depth', provenance)
	};
}

export function textFact(product: Product, label: string, field: keyof Product, provenance?: Record<string, ProvenanceRow>): Fact {
	const value = text(product[field]);
	return { label, value, missing: value ? null : missingState(product, field, provenance) };
}

export function listFact(product: Product, label: string, field: 'missions' | 'instruments'): Fact {
	const list = product[field];
	const value = list.length ? list.join(', ') : null;
	return { label, value, missing: value ? null : missingState(product, field) };
}

export function missionText(product: Product): string | null {
	if (isMimRecord(product)) return null;
	return product.mission_name || (product.missions.length ? product.missions.join(', ') : null);
}

/** Accuracy/uncertainty evidence with metric, value, unit and source kind kept together. */
export interface QualityEvidence {
	kind: 'geometric' | 'radiometric';
	label: string;
	reported: boolean;
	display: string | null;
	metric: string | null;
	value: number | null;
	unit: string | null;
	sourceTitle: string | null;
	sourceUrl: string | null;
	/** Plain-language source kind; never implies independent validation without evidence. */
	sourceKind: string | null;
	dateChecked: string | null;
	missing: { kind: MissingKind; text: string } | null;
}

const EVIDENCE_KIND: Record<string, string> = {
	provider_product_documentation: 'Provider documentation (provider-reported specification or claim; validation method not established)',
	approved_review_document: 'CEOS-ARD review document',
	peer_review_summary: 'CEOS WGCV peer-review outcome',
	official_ceos_register: 'CEOS-ARD register',
	mission_instrument_documentation: 'Mission or instrument documentation',
	other_authoritative_source: 'Other authoritative source'
};

export function evidenceKindLabel(level: string | null | undefined): string | null {
	if (!level) return null;
	return EVIDENCE_KIND[level] ?? level.replaceAll('_', ' ');
}

export function qualityEvidence(product: Product, kind: 'geometric' | 'radiometric', provenance?: Record<string, ProvenanceRow>): QualityEvidence {
	const prefix = kind === 'geometric' ? 'geometric_accuracy' : 'radiometric_accuracy';
	const display = product[`${prefix}_display` as keyof Product] as string | null;
	const row = provenance?.[`${prefix}_display`];
	const reported = Boolean(display);
	return {
		kind,
		label: kind === 'geometric' ? 'Geometric accuracy / uncertainty' : 'Radiometric accuracy / uncertainty',
		reported,
		display,
		metric: product[`${prefix}_metric` as keyof Product] as string | null,
		value: product[`${prefix}_value` as keyof Product] as number | null,
		unit: product[`${prefix}_unit` as keyof Product] as string | null,
		sourceTitle: reported && row ? row.source_title : null,
		sourceUrl: reported && row ? row.source_url : null,
		sourceKind: reported ? (row ? evidenceKindLabel(row.evidence_level) : isMimRecord(product) ? 'MIM record' : null) : null,
		dateChecked: row ? row.date_checked : null,
		missing: reported ? null : missingState(product, `${prefix}_display`, provenance)
	};
}

export function qualitySummary(product: Product): string {
	const geometric = Boolean(product.geometric_accuracy_display);
	const radiometric = Boolean(product.radiometric_accuracy_display);
	if (geometric && radiometric) return 'Geometric and radiometric values reported';
	if (geometric) return 'Geometric value reported; radiometric not established';
	if (radiometric) return 'Radiometric value reported; geometric not established';
	return 'No accuracy or uncertainty values established';
}

/** Assessment label shown on summaries; colour is always paired with this text. */
export function assessmentLabel(product: Product): { text: string; tone: 'assessed' | 'progress' | 'neutral' } {
	if (product.ceos_ard_verified) return { text: 'CEOS-ARD assessed', tone: 'assessed' };
	if (product.ceos_ard_status === 'Assessment in progress') return { text: 'Assessment in progress', tone: 'progress' };
	return { text: product.ceos_ard_status || 'Status unknown', tone: 'neutral' };
}

export function sourceLabel(sourceType: string): string {
	return (
		{
			curated_ceos_ard: 'Curated CEOS-ARD record',
			'MIM API candidate': 'MIM mission candidate',
			'MIM API product': 'MIM API product and instrument join'
		}[sourceType] ?? sourceType
	);
}

export interface ProductLink {
	label: string;
	url: string;
	kind: 'access' | 'documentation' | 'sample' | 'self-assessment' | 'peer-review' | 'record';
}

export function safeUrl(value: string | null | undefined): string | null {
	if (!value) return null;
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
	} catch {
		return null;
	}
}

export function productLinks(product: Product): ProductLink[] {
	const candidates: [string, string | null, ProductLink['kind']][] = [
		['Access data', product.access_url, 'access'],
		['Product documentation', product.information_url, 'documentation'],
		['Sample product', product.sample_product_url, 'sample'],
		['CEOS-ARD self-assessment', product.self_assessment_url, 'self-assessment'],
		['CEOS peer-review outcome', product.peer_review_url, 'peer-review'],
		['Source record', product.ceos_ard_record_url ?? product.source_url, 'record']
	];
	const links: ProductLink[] = [];
	for (const [label, raw, kind] of candidates) {
		const url = safeUrl(raw);
		if (url) links.push({ label, url, kind });
	}
	return links;
}

/** The primary access action, with a documentation fallback when no access link is sourced. */
export function accessAction(product: Product): { label: string; url: string | null; fallback: boolean; explanation: string | null } {
	const access = safeUrl(product.access_url);
	if (access) return { label: 'Access data', url: access, fallback: false, explanation: null };
	const documentation = safeUrl(product.information_url) ?? safeUrl(product.ceos_ard_record_url) ?? safeUrl(product.source_url);
	return {
		label: documentation ? 'Documentation' : 'No access link',
		url: documentation,
		fallback: true,
		explanation: documentation ? 'No sourced access link; the documentation describes how to obtain the data.' : 'No access or documentation link is recorded.'
	};
}
