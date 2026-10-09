/**
 * MIM product/instrument normalisation — a port of legacy `mims_api.normalise_product`.
 *
 * Products are joined to instruments only by stable instrument ID. Instrument resolution
 * is a labelled display fallback and is never assigned to `spatial_resolution_m`.
 */
import { PRODUCT_DEFAULTS } from '$lib/domain/catalogue';
import { formatG } from '$lib/domain/text';
import type { Product } from '$lib/domain/types';

type Json = Record<string, unknown>;

export const MIM_MISSION_PLACEHOLDER = 'Not reported by MIM product endpoint';

function isDict(value: unknown): value is Json {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Python truthiness for JSON values. */
function truthy(value: unknown): boolean {
	if (value === null || value === undefined || value === false || value === 0 || value === '') return false;
	if (Array.isArray(value)) return value.length > 0;
	if (isDict(value)) return Object.keys(value).length > 0;
	return !(typeof value === 'number' && Number.isNaN(value));
}

/** Python `str()` for JSON scalars. */
function pyStr(value: unknown): string {
	if (value === true) return 'True';
	if (value === false) return 'False';
	if (value === null || value === undefined) return 'None';
	return String(value);
}

function first(item: Json, keys: string[]): unknown {
	for (const key of keys) {
		if (key in item && item[key] !== null && item[key] !== '' && item[key] !== undefined) return item[key];
	}
	return null;
}

function numberValue(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function list(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function sortedUnique(values: string[]): string[] {
	return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function productFamily(item: Json): string {
	const rawType = pyStr(truthy(item.type) ? item.type : '');
	const category = pyStr(truthy(item.category) ? item.category : '');
	const name = truthy(item.product_name) ? pyStr(item.product_name) : '';
	const text = `${rawType} ${category} ${name}`.toLowerCase();
	if (text.includes('surface reflectance') || text.includes('ard/sr')) return 'Surface Reflectance';
	if (text.includes('aquatic reflectance') || text.includes('ard/ar')) return 'Aquatic Reflectance';
	if (text.includes('surface temperature') || text.includes('thermal')) return 'Surface Temperature';
	if (text.includes('synthetic aperture radar') || text.includes('sar') || text.includes('radar')) return 'Synthetic Aperture Radar';
	if (text.includes('night-time') || text.includes('nighttime') || text.includes('night lights')) return 'Night-time Lights';
	return rawType || category || 'MIM product family unavailable';
}

const NAME_RESOLUTION = /(?<![\d.])(\d+(?:\.\d+)?)\s*m(?![\p{L}\p{N}_])/iu;

/** Use only explicit product fields or an explicit metre value in the API product name. */
export function explicitProductResolution(item: Json): [number | null, string | null, string] {
	const direct = numberValue(first(item, ['product_spatial_resolution_m', 'spatial_resolution_m']));
	if (direct !== null) return [direct, `${formatG(direct)} m`, 'Explicit product-resolution field from the MIM API'];
	const name = truthy(item.product_name) ? pyStr(item.product_name) : '';
	const match = NAME_RESOLUTION.exec(name);
	if (match) {
		const value = Number(match[1]);
		return [value, `${formatG(value)} m (reported in API product name)`, 'Explicit metre value reported in the MIM API product name'];
	}
	return [null, null, 'Product-level resolution not reported by the MIM API'];
}

/** Port of `normalise_product`. Returns null for records without a stable ID or name. */
export function normaliseMimProduct(item: Json, instrumentsById: Map<number, Json>, sourceUrl: string): Product | null {
	const productId = first(item, ['product_id', 'id']);
	const productName = first(item, ['product_name', 'name', 'title']);
	if (productId === null || productName === null) return null;

	const links = list(item.instruments).filter(isDict);
	const linked: Json[] = [];
	const instrumentNames: string[] = [];
	for (const link of links) {
		const instrumentId = link.instrument_id;
		const detail = typeof instrumentId === 'number' && Number.isFinite(instrumentId) ? instrumentsById.get(Math.trunc(instrumentId)) : undefined;
		if (detail) linked.push(detail);
		const name = truthy(link.instrument_name) ? link.instrument_name : detail?.name_short;
		if (truthy(name) && !instrumentNames.includes(pyStr(name))) instrumentNames.push(pyStr(name));
	}

	const operators = sortedUnique(linked.filter((value) => truthy(value.operator)).map((value) => pyStr(value.operator)));
	const instrumentTypes = sortedUnique(linked.filter((value) => truthy(value.instrument_types)).map((value) => pyStr(value.instrument_types)));
	const resolutionDetails: [string, number, string][] = [];
	for (const instrument of linked) {
		const value = numberValue(instrument.spatial_resolution_best);
		if (value === null) continue;
		const name = pyStr(truthy(instrument.name_short) ? instrument.name_short : truthy(instrument.name_full) ? instrument.name_full : 'Linked instrument');
		const description = pyStr(truthy(instrument.spatial_resolution_description) ? instrument.spatial_resolution_description : `${formatG(value)} m`);
		resolutionDetails.push([name, value, description]);
	}
	const instrumentBest = resolutionDetails.length ? Math.min(...resolutionDetails.map(([, value]) => value)) : null;
	let instrumentDisplay: string | null;
	let instrumentNote: string;
	if (instrumentBest === null) {
		instrumentDisplay = null;
		instrumentNote = 'No linked instrument resolution is reported by the MIM API.';
	} else if (resolutionDetails.length === 1) {
		const [name, , description] = resolutionDetails[0]!;
		instrumentDisplay = `${formatG(instrumentBest)} m (${name})`;
		instrumentNote = `Instrument-level value: ${name} — ${description}.`;
	} else {
		instrumentDisplay = `${formatG(instrumentBest)} m best across ${resolutionDetails.length} linked instruments`;
		instrumentNote = `Instrument-level values: ${resolutionDetails.map(([name, , description]) => `${name} — ${description}`).join('; ')}.`;
	}

	const [productResolution, productResolutionDisplay, productResolutionBasis] = explicitProductResolution(item);
	const statuses = sortedUnique(links.filter((link) => truthy(link.product_status)).map((link) => pyStr(link.product_status)));
	const certifications = list(item.certifications).filter(isDict);
	const ceosCertifications = certifications.filter((value) => pyStr(truthy(value.scheme) ? value.scheme : '').toLowerCase() === 'ceos-ard');
	// CEOS-ARD assessed requires BOTH the link status and certification evidence (approval date or review URL).
	const completed = ceosCertifications.some((value) => truthy(value.approval_date) || truthy(value.review_url)) && statuses.includes('CEOS-ARD');
	const inProgress = statuses.some((value) => value.toLowerCase().includes('development') || value.toLowerCase().includes('progress'));
	const ceosStatus = completed ? 'CEOS-ARD assessed' : inProgress ? 'Assessment in progress' : 'Status unknown';
	const certification = ceosCertifications[0] ?? {};
	const accessLink = links.find((link) => truthy(link.access_url));
	const accessUrl = accessLink ? pyStr(accessLink.access_url) : null;
	const itemDocumentation = truthy(item.documentation_url) ? pyStr(item.documentation_url) : '';
	const linkDocumentation = links.find((link) => truthy(link.documentation_url));
	const documentationUrl = itemDocumentation || (linkDocumentation ? pyStr(linkDocumentation.documentation_url) : null);
	const fallbackNote =
		productResolution === null && instrumentBest !== null
			? "Display fallback: the card shows the linked instrument's finest reported spatial resolution because the MIM data product record does not report product-level resolution. This instrument value is not used for product matching."
			: '';
	const textOrNull = (value: unknown) => (truthy(value) ? pyStr(value) : null);
	const joinedStatuses = statuses.join(', ') || null;

	return {
		...structuredClone(PRODUCT_DEFAULTS),
		id: `mim-product:${pyStr(productId)}`,
		product_name: pyStr(productName),
		official_product_name: pyStr(productName),
		mission_name: MIM_MISSION_PLACEHOLDER,
		family: truthy(item.category) ? pyStr(item.category) : 'MIM API products',
		provider: operators.join(', ') || null,
		agency: operators.join(', ') || null,
		product_family: productFamily(item),
		spatial_resolution_m: productResolution,
		spatial_resolution_display: productResolutionDisplay,
		spatial_resolution_basis: productResolutionBasis,
		instrument_spatial_resolution_best_m: instrumentBest,
		instrument_spatial_resolution_display: instrumentDisplay,
		instrument_resolution_note: instrumentNote,
		sensor_or_instrument_type: instrumentTypes.join(', ') || null,
		instruments: instrumentNames,
		operational_status: joinedStatuses,
		data_format: textOrNull(item.format),
		ceos_ard_status: ceosStatus,
		ceos_ard_verified: completed,
		ceos_ard_pfs: textOrNull(item.type),
		ceos_ard_assessment_level: joinedStatuses,
		pfs_type: textOrNull(item.type),
		pfs_version: textOrNull(certification.spec_version),
		approval_date: textOrNull(certification.approval_date),
		peer_review_url: textOrNull(certification.review_url),
		information_url: documentationUrl,
		access_url: accessUrl,
		ceos_ard_record_url: documentationUrl,
		source_type: 'MIM API product',
		source_url: documentationUrl || sourceUrl.replace(/\/products\/?$/, `/product/${pyStr(productId)}`),
		notes: fallbackNote || 'MIM API product joined to linked instruments by stable instrument ID.'
	};
}

/**
 * The browser-safe representation. Applies the recorded bug fix: the prototype stored a
 * display placeholder in `mission_name`, which made every MIM record match a search for
 * words such as "reported". The placeholder is now a missing value.
 */
export function toBrowserProduct(product: Product): Product {
	return { ...product, mission_name: product.mission_name === MIM_MISSION_PLACEHOLDER ? null : product.mission_name };
}

export function instrumentIndex(instruments: Json[]): Map<number, Json> {
	const index = new Map<number, Json>();
	for (const item of instruments) {
		if (typeof item.instrument_id === 'number' && Number.isFinite(item.instrument_id)) index.set(Math.trunc(item.instrument_id), item);
	}
	return index;
}
