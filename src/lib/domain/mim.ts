/**
 * CEOS MIM database snapshot ("mim-snapshot/1") linked to curated products. Pure TypeScript.
 *
 * Built at development time by tools/build_mim_snapshot.mjs from data/mim/links.json and the
 * public CEOS Database API. Values from MIM are shown with a purple asterisk and never affect
 * filtering, matching or ordering; curated values always take precedence.
 */

export class MimSnapshotError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'MimSnapshotError';
	}
}

export interface MimCredit {
	rights_holder: string | null;
	license: string | null;
	license_url: string | null;
	source_url: string | null;
	modified: boolean;
}

export interface MimVisual {
	kind: 'specific' | 'generic';
	caption: string | null;
	colour_512: string | null;
	icon: string | null;
	photo_512: string | null;
	credit: MimCredit | null;
}

export interface MimMission {
	mission_id: number;
	slug: string | null;
	acronym: string | null;
	full_name: string | null;
	status: string | null;
	launch_date: string | null;
	eol_date: string | null;
	lead_agency: string | null;
	orbit_type: string | null;
	orbit_sense: string | null;
	orbit_altitude_km: number | null;
	orbit_inclination_deg: number | null;
	orbit_lst: string | null;
	repeat_cycle_days: number | null;
	orbit_period_min: number | null;
	norad_id: number | null;
	description: string | null;
	eoportal_url: string | null;
	mission_url: string | null;
	data_site_url: string | null;
	visual: MimVisual | null;
}

export interface MimSarMode {
	name: string | null;
	code: string | null;
	azimuth_resolution_m: number | null;
	range_resolution_m: number | null;
	swath_km: number | null;
	incidence_min_deg: number | null;
	incidence_max_deg: number | null;
	nesz_db: number | null;
	polarisations: string | null;
	bandwidth_mhz: number | null;
}

export interface MimInstrument {
	instrument_id: number;
	slug: string | null;
	name_short: string | null;
	name_full: string | null;
	instrument_types: string | null;
	status: string | null;
	maturity: string | null;
	operator: string | null;
	spatial_resolution_best_m: number | null;
	spatial_resolution_description: string | null;
	swath_width_max_km: number | null;
	swath_width_description: string | null;
	waveband_description: string | null;
	accuracy_description: string | null;
	data_format_info: string | null;
	measurement_description: string | null;
	measurements: { category: string | null; name: string }[];
	is_commercial: boolean;
	sar: {
		band: string | null;
		centre_frequency_ghz: number | null;
		bandwidth_max_mhz: number | null;
		polarisations: string[];
		polarisation_modes: string[];
		look_direction: string | null;
		look_direction_nominal: string | null;
		polarisation_notes: string | null;
		imaging_modes: MimSarMode[];
		source: string | null;
	} | null;
}

export interface MimProductRecord {
	product_id: number;
	product_name: string | null;
	product_short_name: string | null;
	category: string | null;
	level: string | null;
	type: string | null;
	format: string | null;
	documentation_url: string | null;
	source: string | null;
	statuses: string[];
	access_url: string | null;
	instrument_ids: number[];
	instrument_links: { instrument_id: number; instrument_name: string | null; provider_product_name: string | null; provider_product_code: string | null; product_status: string | null; access_url: string | null; documentation_url: string | null }[];
	certification: { spec_version: string | null; approval_date: string | null; review_url: string | null } | null;
}

export interface MimConstellation {
	constellation_id: number;
	slug: string | null;
	name_short: string | null;
	name_full: string | null;
	operator: string | null;
	status: string | null;
	first_launch_date: string | null;
	latest_launch_date: string | null;
	active_unit_count: number | null;
	target_unit_count: number | null;
	revisit_time_hours: number | null;
	orbit_description: string | null;
	description: string | null;
}

export interface MimSource {
	api: string;
	edition: string | null;
	as_of: string | null;
	retrieved: string;
	licence: { name: string; url: string | null };
	attribution: string;
}

export interface MimSnapshot {
	schema: 'mim-snapshot/1';
	source: MimSource;
	products: Record<string, { mim_product: MimProductRecord; mission_ids: number[]; constellation_ids: number[]; note: string | null }>;
	instruments: Record<string, MimInstrument>;
	missions: Record<string, MimMission>;
	constellations: Record<string, MimConstellation>;
}

/** Everything MIM says about one curated product, resolved from the snapshot. */
export interface MimDetails {
	source: MimSource;
	product: MimProductRecord;
	missions: MimMission[];
	instruments: MimInstrument[];
	constellations: MimConstellation[];
	note: string | null;
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const httpsOrNull = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && /^https:\/\//.test(value));
const has = (record: Record<string, unknown>, key: string) => Object.hasOwn(record, key);

/**
 * Structural validation: the snapshot is generated, so this guards against hand edits and
 * format drift. Every link must resolve; every outbound URL must be https.
 */
export function parseMimSnapshot(raw: unknown, knownProductIds: Iterable<string>): MimSnapshot {
	if (!isObject(raw) || raw.schema !== 'mim-snapshot/1') throw new MimSnapshotError('MIM snapshot: schema must be "mim-snapshot/1"');
	const errors: string[] = [];
	const source = raw.source;
	if (!isObject(source) || typeof source.attribution !== 'string' || typeof source.api !== 'string' || !isObject(source.licence)) errors.push('source must name the API, licence and attribution');
	const products = isObject(raw.products) ? raw.products : (errors.push('products must be an object'), {});
	const instruments = isObject(raw.instruments) ? raw.instruments : (errors.push('instruments must be an object'), {});
	const missions = isObject(raw.missions) ? raw.missions : (errors.push('missions must be an object'), {});
	const constellations = isObject(raw.constellations) ? raw.constellations : {};
	const known = new Set(knownProductIds);
	for (const [id, entry] of Object.entries(products)) {
		if (!known.has(id)) errors.push(`products.${id} is not a curated product`);
		if (!isObject(entry) || !isObject(entry.mim_product) || !Array.isArray(entry.mission_ids)) {
			errors.push(`products.${id} is malformed`);
			continue;
		}
		for (const missionId of entry.mission_ids) if (typeof missionId !== 'number' || !has(missions, String(missionId))) errors.push(`products.${id} refers to missing mission ${missionId}`);
		for (const constellationId of Array.isArray(entry.constellation_ids) ? entry.constellation_ids : []) if (typeof constellationId !== 'number' || !has(constellations, String(constellationId))) errors.push(`products.${id} refers to missing constellation ${constellationId}`);
		const product = entry.mim_product as Record<string, unknown>;
		const instrumentIds = product.instrument_ids;
		if (!Array.isArray(instrumentIds)) errors.push(`products.${id}.mim_product.instrument_ids must be a list`);
		else for (const instrumentId of instrumentIds) if (typeof instrumentId !== 'number' || !has(instruments, String(instrumentId))) errors.push(`products.${id} refers to missing instrument ${instrumentId}`);
		if (!Array.isArray(product.statuses) || product.statuses.some((status) => typeof status !== 'string')) errors.push(`products.${id}.mim_product.statuses must be a list of text`);
		for (const key of ['documentation_url', 'access_url']) if (!httpsOrNull(product[key])) errors.push(`products.${id}.mim_product.${key} must be https or null`);
		if (isObject(product.certification) && !httpsOrNull(product.certification.review_url)) errors.push(`products.${id}.mim_product.certification.review_url must be https or null`);
		for (const link of Array.isArray(product.instrument_links) ? product.instrument_links : []) {
			if (isObject(link) && (!httpsOrNull(link.access_url) || !httpsOrNull(link.documentation_url))) errors.push(`products.${id}.mim_product.instrument_links URLs must be https or null`);
		}
	}
	for (const [id, mission] of Object.entries(missions)) {
		if (!isObject(mission) || mission.mission_id !== Number(id)) {
			errors.push(`missions.${id} is malformed`);
			continue;
		}
		for (const key of ['eoportal_url', 'mission_url', 'data_site_url']) if (!httpsOrNull(mission[key])) errors.push(`missions.${id}.${key} must be https or null`);
		const visual = mission.visual;
		if (visual !== null && visual !== undefined) {
			if (!isObject(visual) || (visual.kind !== 'specific' && visual.kind !== 'generic')) errors.push(`missions.${id}.visual is malformed`);
			else {
				for (const key of ['colour_512', 'icon', 'photo_512']) if (visual[key] !== null && (typeof visual[key] !== 'string' || !/^\/images\/[A-Za-z0-9/_.-]+$/.test(visual[key] as string))) errors.push(`missions.${id}.visual.${key} must be an /images/ path`);
				if (isObject(visual.credit) && (!httpsOrNull(visual.credit.license_url) || !httpsOrNull(visual.credit.source_url))) errors.push(`missions.${id}.visual.credit URLs must be https or null`);
			}
		}
	}
	for (const [id, instrument] of Object.entries(instruments)) {
		if (!isObject(instrument) || instrument.instrument_id !== Number(id)) errors.push(`instruments.${id} is malformed`);
		else if (isObject(instrument.sar) && !Array.isArray(instrument.sar.imaging_modes)) errors.push(`instruments.${id}.sar.imaging_modes must be a list`);
	}
	if (errors.length) throw new MimSnapshotError(`MIM snapshot: ${errors.join('; ')}`);
	return raw as unknown as MimSnapshot;
}

export function mimDetailsFor(snapshot: MimSnapshot | null, productId: string): MimDetails | null {
	const entry = snapshot?.products[productId];
	if (!snapshot || !entry) return null;
	return {
		source: snapshot.source,
		product: entry.mim_product,
		missions: entry.mission_ids.map((id) => snapshot.missions[String(id)]).filter((mission): mission is MimMission => Boolean(mission)),
		instruments: entry.mim_product.instrument_ids.map((id) => snapshot.instruments[String(id)]).filter((instrument): instrument is MimInstrument => Boolean(instrument)),
		constellations: (entry.constellation_ids ?? []).map((id) => snapshot.constellations?.[String(id)]).filter((item): item is MimConstellation => Boolean(item)),
		note: entry.note
	};
}

/** "edition e574f0c2, data as of 2026-10-23" */
export function mimEditionText(source: MimSource): string {
	return [source.edition ? `edition ${source.edition}` : null, source.as_of ? `data as of ${source.as_of}` : null].filter(Boolean).join(', ');
}

// ---------------------------------------------------------------------------- mission visuals

/** A vendored picture of one mission's spacecraft (assets/mission_visuals, tools/fetch_mission_visuals.mjs). */
export interface MissionVisual {
	mission_id: number;
	acronym: string | null;
	/** Silhouette icon URL (CEOS MIM original artwork, CC BY 4.0). */
	icon: string;
	/** Spacecraft picture URL, only when MIM records a credit for it. */
	image: string | null;
	credit: MimCredit | null;
}

/** The picture shown for a product: its newest mission with spacecraft-specific artwork. */
export interface ProductVisual extends MissionVisual {
	/** How many missions the product covers (e.g. "Landsat 9, one of 5 missions"). */
	mission_count: number;
}

export const ICON_CREDIT = 'Silhouette: CEOS MIM Database (CC BY 4.0)';

/**
 * Whether a mission has ended. "Operational (extended)" missions have not: their end-of-life date
 * is planned. A mission ends when MIM says so, or when its end-of-life date has passed.
 */
export function missionEnded(mission: Pick<MimMission, 'status' | 'eol_date'>, today = new Date().toISOString().slice(0, 10)): boolean {
	if (/\b(mission complete|decommissioned|inactive|failed|lost)\b/i.test(mission.status ?? '')) return true;
	if (/\boperational\b/i.test(mission.status ?? '')) return false;
	return Boolean(mission.eol_date && mission.eol_date < today);
}

/** Compare links regardless of scheme, "www.", trailing slash and fragment. */
export function sameUrl(a: string | null | undefined, b: string | null | undefined): boolean {
	const key = (url: string) => url.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/#.*$/, '').replace(/\/+$/, '');
	return Boolean(a && b) && key(a!) === key(b!);
}

export function productVisual(details: MimDetails | null, visuals: Record<string, MissionVisual>): ProductVisual | null {
	if (!details) return null;
	const candidates = details.missions.filter((m) => visuals[String(m.mission_id)]);
	if (!candidates.length) return null;
	const newest = candidates.reduce((a, b) => ((b.launch_date ?? '') > (a.launch_date ?? '') ? b : a));
	return { ...visuals[String(newest.mission_id)]!, mission_count: details.missions.length + details.constellations.length };
}

// ---------------------------------------------------------------------------- compact summaries

/** Compact MIM facts for lists, comparison and summaries (the product page gets full details). */
export interface MimSummary {
	missions: { mission_id: number; acronym: string | null; status: string | null; launch_date: string | null; eol_date: string | null; repeat_cycle_days: number | null }[];
	instruments: { name_short: string | null; instrument_types: string | null; swath_width_description: string | null; spatial_resolution_best_m: number | null; spatial_resolution_description: string | null }[];
	format: string | null;
}

export function mimSummary(details: MimDetails): MimSummary {
	return {
		missions: details.missions.map((m) => ({ mission_id: m.mission_id, acronym: m.acronym, status: m.status, launch_date: m.launch_date, eol_date: m.eol_date, repeat_cycle_days: m.repeat_cycle_days })),
		instruments: details.instruments.map((i) => ({
			name_short: i.name_short,
			instrument_types: i.instrument_types,
			swath_width_description: i.swath_width_description,
			spatial_resolution_best_m: i.spatial_resolution_best_m,
			spatial_resolution_description: i.spatial_resolution_description
		})),
		format: details.product.format
	};
}

/** A value MIM supplies where the curated record has none. Display only; never used for matching. */
export interface MimFill {
	value: string;
	basis: string;
}

const unique = (values: (string | null)[]) => [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
const named = (pairs: [string | null, string | null][]) => {
	const withText = pairs.filter(([, text]) => text);
	const texts = unique(withText.map(([, text]) => text));
	if (!texts.length) return null;
	// One shared value needs no instrument names.
	return texts.length === 1 ? texts[0]! : withText.map(([name, text]) => (name ? `${name}: ${text}` : text)).join('; ');
};

export function mimSwathFill(summary: MimSummary | null | undefined): MimFill | null {
	const value = summary ? named(summary.instruments.map((i) => [i.name_short, i.swath_width_description])) : null;
	return value ? { value, basis: 'Instrument-level value from the CEOS MIM database' } : null;
}

export function mimInstrumentTypeFill(summary: MimSummary | null | undefined): MimFill | null {
	const values = summary ? unique(summary.instruments.map((i) => i.instrument_types)) : [];
	return values.length ? { value: values.join('; '), basis: 'Instrument type from the CEOS MIM database' } : null;
}

export function mimFormatFill(summary: MimSummary | null | undefined): MimFill | null {
	return summary?.format ? { value: summary.format, basis: 'Product format recorded in the CEOS MIM database' } : null;
}

export function mimInstrumentResolutionFill(summary: MimSummary | null | undefined): MimFill | null {
	const reported = (summary?.instruments ?? []).filter((i) => i.spatial_resolution_best_m !== null);
	if (!reported.length) return null;
	const best = reported.reduce((a, b) => (b.spatial_resolution_best_m! < a.spatial_resolution_best_m! ? b : a));
	const detail = named(reported.map((i) => [i.name_short, i.spatial_resolution_description]));
	return {
		value: `${Number(best.spatial_resolution_best_m!.toPrecision(6))} m${best.name_short && reported.length > 1 ? ` (${best.name_short})` : ''}`,
		basis: `Instrument-level value from the CEOS MIM database, not product resolution${detail ? `. ${detail}` : ''}`
	};
}

const year = (date: string | null) => (date && /^\d{4}/.test(date) ? date.slice(0, 4) : null);

/** "Landsat 8: Operational (nominal); Landsat 9: Operational (nominal)" — shared statuses are grouped. */
export function mimMissionStatusText(summary: MimSummary | null | undefined): string | null {
	if (!summary?.missions.length) return null;
	const groups = new Map<string, string[]>();
	for (const m of summary.missions) {
		const status = m.status ?? 'Status not recorded';
		groups.set(status, [...(groups.get(status) ?? []), m.acronym ?? `Mission ${m.mission_id}`]);
	}
	return groups.size === 1 && summary.missions.length > 1
		? `${[...groups.keys()][0]} (all ${summary.missions.length} missions)`
		: [...groups.entries()].map(([status, names]) => `${names.join(', ')}: ${status}`).join('; ');
}

/** "Landsat 4 1982–2001 · Landsat 8 2013–2030" (end year is planned or actual end of life). */
export function mimMissionYearsText(summary: MimSummary | null | undefined): string | null {
	if (!summary?.missions.length) return null;
	return summary.missions.map((m) => `${m.acronym ?? `Mission ${m.mission_id}`} ${year(m.launch_date) ?? '?'}–${year(m.eol_date) ?? ''}`.trim()).join(' · ');
}
