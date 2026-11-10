#!/usr/bin/env node
/**
 * Build data/mim/snapshot.json and reports/mim_reconciliation.md from the public CEOS Database
 * API (CEOS MIM database). Development-time only; the app reads the committed snapshot.
 *
 *   node tools/build_mim_snapshot.mjs
 *
 * Reads data/mim/links.json (curated product → MIM product and missions) and fetches only the
 * linked records: products, instruments (with SAR parameters for radars), missions and mission
 * visuals, plus /meta for the edition and licence. Requests are sequential and paced well under
 * the anonymous limit. Behind a proxy, run with NODE_USE_ENV_PROXY=1 (Node 22.21+).
 * Set MIMS_API_KEY to send a key; MIMS_API_BASE_URL to use another API root.
 *
 * Data: CEOS MIM Database, https://database.eohandbook.com (CC BY 4.0).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = (process.env.MIMS_API_BASE_URL || 'https://ceos-capabilities.org/api').replace(/\/+$/, '');
const HEADERS = { Accept: 'application/json', ...(process.env.MIMS_API_KEY ? { 'X-API-Key': process.env.MIMS_API_KEY } : {}) };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function get(path, { optional = false } = {}) {
	for (let attempt = 0; attempt < 4; attempt += 1) {
		let response;
		try {
			response = await fetch(`${API}${path}`, { headers: HEADERS });
		} catch {
			// Network errors (e.g. a reset connection) are retried like 5xx responses.
			await sleep(1000 * (attempt + 1));
			continue;
		}
		if (response.status === 404 && optional) return null;
		if (response.status === 429 || response.status >= 500) {
			await sleep(Number(response.headers.get('retry-after')) * 1000 || 1000 * (attempt + 1));
			continue;
		}
		if (!response.ok) throw new Error(`GET ${path}: HTTP ${response.status}`);
		await sleep(120);
		return response.json();
	}
	throw new Error(`GET ${path}: gave up after retries`);
}

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const firstUrl = (value) => text(value)?.split(/;\s*|\s+/).find((part) => /^https:\/\//.test(part)) ?? null;
// CEOS pages are served over https; older records still link them with http, so upgrade those.
const https = (value) => {
	const url = text(value)?.replace(/^http:\/\/((?:www\.)?ceos\.org\/)/i, 'https://$1');
	return url && /^https:\/\//.test(url) ? url : null;
};
const short = (value, max = 320) => {
	const t = text(value);
	return t && t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t;
};

function pickMission(m) {
	return {
		mission_id: m.mission_id,
		slug: text(m.slug),
		acronym: text(m.mission_acronym),
		full_name: text(m.full_name),
		status: text(m.status),
		launch_date: text(m.launch_date),
		eol_date: text(m.eol_date),
		lead_agency: text(m.lead_agency),
		orbit_type: text(m.orbit_type),
		orbit_sense: text(m.orbit_sense),
		orbit_altitude_km: num(m.orbit_altitude_km),
		orbit_inclination_deg: num(m.orbit_inclination_deg),
		orbit_lst: text(m.orbit_lst),
		repeat_cycle_days: num(m.repeat_cycle_days),
		orbit_period_min: num(m.orbit_period_min),
		norad_id: num(m.norad_id) || null,
		description: short(m.description),
		eoportal_url: https(m.eoportal_url),
		mission_url: firstUrl(m.mission_url),
		data_site_url: firstUrl(m.data_site_url),
		visual: null
	};
}

function pickVisual(v) {
	if (!v || !v.images) return null;
	const credit = v.credit && typeof v.credit === 'object' ? v.credit : null;
	return {
		kind: v.kind === 'specific' ? 'specific' : 'generic',
		caption: text(v.caption),
		// Paths are relative to the API root (e.g. /images/satellites/…).
		colour_512: text(v.images.png_512),
		icon: text(v.images.icon),
		photo_512: text(v.images.photo_cut_512),
		credit: credit
			? {
					rights_holder: text(credit.rights_holder),
					license: text(credit.license),
					license_url: https(credit.license_url),
					source_url: https(credit.source_url),
					modified: credit.modified === true
				}
			: null
	};
}

function pickInstrument(i) {
	return {
		instrument_id: i.instrument_id,
		slug: text(i.slug),
		name_short: text(i.name_short),
		name_full: text(i.name_full),
		instrument_types: text(i.instrument_types),
		status: text(i.status),
		maturity: text(i.maturity),
		operator: text(i.operator),
		spatial_resolution_best_m: num(i.spatial_resolution_best),
		spatial_resolution_description: text(i.spatial_resolution_description),
		swath_width_max_km: num(i.swath_width_max),
		swath_width_description: text(i.swath_width_description),
		waveband_description: text(i.waveband_description),
		accuracy_description: text(i.accuracy_description),
		data_format_info: text(i.data_format_info),
		measurement_description: short(i.measurement_description),
		measurements: (i.measurements ?? []).map((m) => ({ category: text(m.category), name: text(m.name) })).filter((m) => m.name),
		is_commercial: i.is_commercial === 1 || i.is_commercial === true,
		sar: null
	};
}

function pickSar(s) {
	if (!s || !s.sar_parameters) return null;
	const p = s.sar_parameters;
	const flags = (o) => Object.entries(o ?? {}).filter(([, on]) => on === true).map(([key]) => key.toUpperCase());
	return {
		band: text(p.waveband),
		centre_frequency_ghz: num(p.centre_frequency_ghz),
		bandwidth_max_mhz: num(p.bandwidth_max_mhz),
		polarisations: flags(p.polarisation_channels),
		polarisation_modes: flags(p.polarisation_modes).map((mode) => mode[0] + mode.slice(1).toLowerCase()),
		look_direction: text(p.look_direction),
		look_direction_nominal: text(p.look_direction_nominal),
		polarisation_notes: short(p.polarisation_notes),
		imaging_modes: (s.imaging_modes ?? []).map((mode) => ({
			name: text(mode.mode_name),
			code: text(mode.mode_code),
			azimuth_resolution_m: num(mode.azimuth_resolution_m),
			range_resolution_m: num(mode.range_resolution_m),
			swath_km: num(mode.swath_across_track_km),
			incidence_min_deg: num(mode.incidence_angle_min_deg),
			incidence_max_deg: num(mode.incidence_angle_max_deg),
			nesz_db: num(mode.nesz_db),
			polarisations: text(mode.polarisation_combinations),
			bandwidth_mhz: num(mode.bandwidth_mhz)
		})),
		source: text(s.source)
	};
}

function pickProduct(p) {
	const links = (p.instruments ?? []).map((l) => ({
		instrument_id: l.instrument_id,
		instrument_name: text(l.instrument_name),
		provider_product_name: text(l.provider_product_name),
		provider_product_code: text(l.provider_product_code),
		product_status: text(l.product_status),
		access_url: https(l.access_url),
		documentation_url: https(l.documentation_url)
	}));
	const cert = (p.certifications ?? []).find((c) => (c.scheme ?? '').toLowerCase() === 'ceos-ard') ?? null;
	return {
		product_id: p.product_id,
		product_name: text(p.product_name),
		product_short_name: text(p.product_short_name),
		category: text(p.category),
		level: text(p.level),
		type: text(p.type),
		format: text(p.format),
		documentation_url: https(p.documentation_url),
		source: text(p.source),
		statuses: [...new Set(links.map((l) => l.product_status).filter(Boolean))],
		access_url: links.find((l) => l.access_url)?.access_url ?? null,
		instrument_ids: links.map((l) => l.instrument_id),
		instrument_links: links,
		certification: cert ? { spec_version: text(cert.spec_version), approval_date: text(cert.approval_date), review_url: https(cert.review_url) } : null
	};
}

function pickConstellation(c) {
	return {
		constellation_id: c.constellation_id,
		slug: text(c.slug),
		name_short: text(c.name_short),
		name_full: text(c.name_full),
		operator: text(c.operator_name),
		status: text(c.status),
		first_launch_date: text(c.first_launch_date),
		latest_launch_date: text(c.latest_launch_date),
		active_unit_count: num(c.active_unit_count),
		target_unit_count: num(c.target_unit_count),
		revisit_time_hours: num(c.revisit_time_hours),
		orbit_description: short(c.orbit_description),
		description: short(c.description)
	};
}

const isSar = (instrument) => /radar|sar/i.test(`${instrument.instrument_types ?? ''} ${instrument.name_short ?? ''}`);

async function main() {
	const links = JSON.parse(readFileSync(resolve(ROOT, 'data/mim/links.json'), 'utf8')).links;
	const curated = JSON.parse(readFileSync(resolve(ROOT, 'data/ceos_ard_products.json'), 'utf8'));
	const curatedById = Object.fromEntries(curated.map((p) => [p.id, p]));
	for (const link of links) if (!curatedById[link.product_id]) throw new Error(`links.json: unknown curated product ${link.product_id}`);

	const meta = await get('/meta');
	const allProducts = (await get('/products')).products;
	const productsById = new Map(allProducts.map((p) => [p.product_id, p]));

	const products = {};
	const instrumentIds = new Set();
	const missionIds = new Set();
	const constellationIds = new Set();
	for (const link of links) {
		const raw = productsById.get(link.mim_product_id);
		if (!raw) throw new Error(`links.json: MIM product ${link.mim_product_id} (${link.product_id}) not found`);
		const product = pickProduct(raw);
		product.instrument_ids.forEach((id) => instrumentIds.add(id));
		link.mission_ids.forEach((id) => missionIds.add(id));
		(link.constellation_ids ?? []).forEach((id) => constellationIds.add(id));
		products[link.product_id] = { mim_product: product, mission_ids: link.mission_ids, constellation_ids: link.constellation_ids ?? [], note: link.note ?? null };
	}

	const instruments = {};
	for (const id of [...instrumentIds].sort((a, b) => a - b)) {
		const raw = await get(`/instrument/${id}`);
		const instrument = pickInstrument(raw);
		if (isSar(instrument)) instrument.sar = pickSar(await get(`/instrument/${id}/sar-parameters`, { optional: true }));
		instruments[id] = instrument;
	}

	const missions = {};
	for (const id of [...missionIds].sort((a, b) => a - b)) {
		const mission = pickMission(await get(`/mission/${id}`));
		mission.visual = pickVisual(await get(`/mission/${id}/visual?variant=colour`, { optional: true }));
		missions[id] = mission;
	}

	const constellations = {};
	for (const id of [...constellationIds].sort((a, b) => a - b)) constellations[id] = pickConstellation(await get(`/constellation/${id}`));

	const snapshot = {
		schema: 'mim-snapshot/1',
		source: {
			api: API,
			edition: text(meta?.registry_edition),
			as_of: text(meta?.as_of),
			retrieved: new Date().toISOString().slice(0, 10),
			licence: { name: text(meta?.licence?.name) ?? 'CC BY 4.0', url: https(meta?.licence?.url) },
			attribution: text(meta?.licence?.attribution) ?? 'CEOS MIM Database, https://database.eohandbook.com'
		},
		products,
		instruments,
		missions,
		constellations
	};
	mkdirSync(resolve(ROOT, 'data/mim'), { recursive: true });
	writeFileSync(resolve(ROOT, 'data/mim/snapshot.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
	writeFileSync(resolve(ROOT, 'reports/mim_reconciliation.md'), reconciliation(snapshot, curatedById, allProducts, links));
	console.log(`Snapshot: ${Object.keys(products).length} products, ${Object.keys(instruments).length} instruments, ${Object.keys(missions).length} missions, ${Object.keys(constellations).length} constellations (edition ${snapshot.source.edition}, data as of ${snapshot.source.as_of}).`);
}

// ---------------------------------------------------------------- reconciliation report

const clean = (value) => (value ?? '').toString().trim().replace(/^v/i, '').toLowerCase();
const host = (url) => {
	try {
		return new URL(url).host.replace(/^www\./, '');
	} catch {
		return null;
	}
};
const cell = (value) => (value === null || value === undefined || value === '' ? '—' : String(value).replaceAll('|', '\\|'));

function reconciliation(snapshot, curatedById, allProducts, links) {
	const rows = [];
	for (const link of links) {
		const c = curatedById[link.product_id];
		const m = snapshot.products[link.product_id].mim_product;
		const mimAssessed = m.statuses.includes('CEOS-ARD') && Boolean(m.certification?.approval_date || m.certification?.review_url);
		// Each check: [field, curated, MIM, state] where state is 'same', 'differs' or 'missing' (MIM has no value).
		const state = (mimValue, same) => (mimValue === null || mimValue === undefined || mimValue === '' ? 'missing' : same ? 'same' : 'differs');
		const checks = [
			['CEOS-ARD assessed', c.ceos_ard_verified ? 'yes' : 'no', mimAssessed ? 'yes' : `no (${m.statuses.join(', ') || 'no status'})`, c.ceos_ard_verified === mimAssessed ? 'same' : 'differs'],
			['PFS version', c.pfs_version, m.certification?.spec_version, state(m.certification?.spec_version, clean(c.pfs_version) === clean(m.certification?.spec_version))],
			['Approval date', c.approval_date, m.certification?.approval_date, state(m.certification?.approval_date, (c.approval_date ?? '') === m.certification?.approval_date)],
			['Access link host', host(c.access_url), host(m.access_url), state(m.access_url, host(c.access_url) === host(m.access_url))],
			['Data format', c.data_format, m.format, state(m.format, clean(c.data_format).includes(clean(m.format)) || clean(m.format).includes(clean(c.data_format)))]
		];
		const differences = checks.filter(([, , , s]) => s === 'differs');
		rows.push({ link, c, m, checks, differences });
	}
	const linkedIds = new Set(links.map((l) => l.mim_product_id));
	const unlinkedAssessed = allProducts.filter((p) => !linkedIds.has(p.product_id) && (p.instruments ?? []).some((i) => i.product_status === 'CEOS-ARD') && (p.certifications ?? []).some((c) => (c.scheme ?? '').toLowerCase() === 'ceos-ard' && (c.approval_date || c.review_url)));
	const unlinkedReview = allProducts.filter((p) => !linkedIds.has(p.product_id) && (p.instruments ?? []).some((i) => i.product_status === 'Under Peer Review'));

	const lines = [];
	lines.push('# Curated catalogue compared with the CEOS MIM database', '');
	lines.push(`Generated by \`tools/build_mim_snapshot.mjs\` on ${snapshot.source.retrieved} from ${snapshot.source.api} (edition \`${snapshot.source.edition}\`, data as of ${snapshot.source.as_of}). Source: ${snapshot.source.attribution} (${snapshot.source.licence.name}).`, '');
	lines.push('This lists differences to review. Neither source is assumed to be right: the curated catalogue cites a source for each field (`data/ceos_ard_research_log.csv`), and MIM is maintained by CEOS agencies through an annual survey. Fix the curated record (`tools/populate_ceos_ard.py`) only after checking the cited sources, or report MIM issues to the MIM team.', '');
	lines.push(`## Linked products (${rows.length} of ${Object.keys(curatedById).length} curated)`, '');
	const differing = rows.filter((r) => r.differences.length);
	lines.push('| Field | Same | Differs | No value in MIM |', '|---|---|---|---|');
	for (const field of rows[0]?.checks.map(([name]) => name) ?? []) {
		const states = rows.map((r) => r.checks.find(([name]) => name === field)[3]);
		lines.push(`| ${field} | ${states.filter((s) => s === 'same').length} | ${states.filter((s) => s === 'differs').length} | ${states.filter((s) => s === 'missing').length} |`);
	}
	lines.push('', `${differing.length} linked products have at least one difference where both sources have a value:`, '');
	lines.push('| Curated product | MIM product | Field | Curated | MIM |', '|---|---|---|---|---|');
	for (const r of differing) {
		for (const [field, curatedValue, mimValue] of r.differences) {
			lines.push(`| ${cell(r.c.product_name)} (\`${r.link.product_id}\`) | ${cell(r.m.product_name)} (#${r.m.product_id}) | ${field} | ${cell(curatedValue)} | ${cell(mimValue)} |`);
		}
	}
	lines.push('', '## Link notes', '');
	for (const r of rows.filter((x) => x.link.note)) lines.push(`- \`${r.link.product_id}\`: ${r.link.note}`);
	lines.push('', `## CEOS-ARD assessed in MIM but not in the curated catalogue (${unlinkedAssessed.length})`, '');
	lines.push('Candidates to research and add. Each needs its PFS, approval and peer-review evidence checked against the CEOS-ARD register before it is added.', '');
	for (const p of unlinkedAssessed) {
		const cert = (p.certifications ?? []).find((c) => c.approval_date || c.review_url) ?? {};
		lines.push(`- **${p.product_name}** (MIM #${p.product_id}) — ${p.type}; ${cert.spec_version ?? 'version not recorded'}${cert.approval_date ? `, approved ${cert.approval_date}` : ''}`);
	}
	lines.push('', `## Under peer review in MIM (${unlinkedReview.length})`, '');
	for (const p of unlinkedReview) lines.push(`- ${p.product_name} (MIM #${p.product_id}) — ${p.type}`);
	lines.push('');
	return lines.join('\n');
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
