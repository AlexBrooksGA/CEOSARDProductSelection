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
	sar: {
		band: string | null;
		centre_frequency_ghz: number | null;
		polarisations: string[];
		polarisation_modes: string[];
		look_direction: string | null;
		imaging_modes: MimSarMode[];
		source: string | null;
	} | null;
}

export interface MimProductRecord {
	product_id: number;
	product_name: string | null;
	category: string | null;
	level: string | null;
	type: string | null;
	format: string | null;
	documentation_url: string | null;
	source: string | null;
	statuses: string[];
	access_url: string | null;
	instrument_ids: number[];
	certification: { spec_version: string | null; approval_date: string | null; review_url: string | null } | null;
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
	products: Record<string, { mim_product: MimProductRecord; mission_ids: number[]; note: string | null }>;
	instruments: Record<string, MimInstrument>;
	missions: Record<string, MimMission>;
}

/** Everything MIM says about one curated product, resolved from the snapshot. */
export interface MimDetails {
	source: MimSource;
	product: MimProductRecord;
	missions: MimMission[];
	instruments: MimInstrument[];
	note: string | null;
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const httpsOrNull = (value: unknown) => value === null || (typeof value === 'string' && /^https:\/\//.test(value));

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
	const known = new Set(knownProductIds);
	for (const [id, entry] of Object.entries(products)) {
		if (!known.has(id)) errors.push(`products.${id} is not a curated product`);
		if (!isObject(entry) || !isObject(entry.mim_product) || !Array.isArray(entry.mission_ids)) {
			errors.push(`products.${id} is malformed`);
			continue;
		}
		for (const missionId of entry.mission_ids) if (!missions[String(missionId)]) errors.push(`products.${id} refers to missing mission ${missionId}`);
		const instrumentIds = (entry.mim_product as Record<string, unknown>).instrument_ids;
		if (!Array.isArray(instrumentIds)) errors.push(`products.${id}.mim_product.instrument_ids must be a list`);
		else for (const instrumentId of instrumentIds) if (!instruments[String(instrumentId)]) errors.push(`products.${id} refers to missing instrument ${instrumentId}`);
		for (const key of ['documentation_url', 'access_url']) if (!httpsOrNull((entry.mim_product as Record<string, unknown>)[key])) errors.push(`products.${id}.mim_product.${key} must be https or null`);
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
			else for (const key of ['colour_512', 'icon', 'photo_512']) if (visual[key] !== null && (typeof visual[key] !== 'string' || !/^\/images\/[A-Za-z0-9/_.-]+$/.test(visual[key] as string))) errors.push(`missions.${id}.visual.${key} must be an /images/ path`);
		}
	}
	for (const [id, instrument] of Object.entries(instruments)) {
		if (!isObject(instrument) || instrument.instrument_id !== Number(id)) errors.push(`instruments.${id} is malformed`);
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
		note: entry.note
	};
}

/** "edition e574f0c2, data as of 2026-10-23" */
export function mimEditionText(source: MimSource): string {
	return [source.edition ? `edition ${source.edition}` : null, source.as_of ? `data as of ${source.as_of}` : null].filter(Boolean).join(', ');
}
