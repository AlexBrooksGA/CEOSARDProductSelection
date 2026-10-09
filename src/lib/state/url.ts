/**
 * Versioned, validated query-parameter contract (v1) for shareable public state.
 * See docs/STATE_CONTRACT.md. Notes, drafts, custom-profile definitions, credentials and
 * upstream responses are never encoded here.
 */
import { COVERAGE_LEVELS, CRITERION_BY_NAME } from '$lib/domain/criteria';
import { NEUTRAL_STATE, cloneState, type ExplorerState } from '$lib/domain/explorer';
import { ALL_FAMILIES } from '$lib/domain/filters';
import { OPTIONAL_GROUP_IDS } from '$lib/domain/comparison';
import { PRODUCT_ID_PATTERN } from '$lib/domain/catalogue';
import { COMPARE_MAX, SHORTLIST_MAX } from '$lib/domain/selection';
import type { CeosFilter, CriterionMode, CriterionName } from '$lib/domain/types';

export const URL_VERSION = '1';
export const LIMITS = { search: 200, sensor: 100, listItems: 30, listItem: 200, profileId: 64 } as const;
/** Above this length a link may not survive every mail client or proxy; offer the copied summary. */
export const SHARE_URL_SOFT_LIMIT = 4000;

const FAMILY_CODES: Record<string, string> = {
	sr: 'Surface Reflectance',
	st: 'Surface Temperature',
	sar: 'Synthetic Aperture Radar',
	ar: 'Aquatic Reflectance',
	ntl: 'Night-time Lights'
};
const FAMILY_TO_CODE = Object.fromEntries(Object.entries(FAMILY_CODES).map(([code, family]) => [family, code]));

const SCOPE_CODES: Record<string, CeosFilter> = {
	assessed: 'CEOS-ARD assessed only',
	all: 'All statuses',
	'in-progress': 'Assessment in progress',
	'not-assessed': 'Not assessed or status unknown'
};
const SCOPE_TO_CODE = Object.fromEntries(Object.entries(SCOPE_CODES).map(([code, scope]) => [scope, code]));

const MODE_CODES: Record<string, CriterionMode> = { req: 'required', pref: 'preferred', ign: 'not_used' };
const MODE_TO_CODE: Record<string, string> = { required: 'req', preferred: 'pref', not_used: 'ign' };

const COVERAGE_CODES: Record<string, string> = {
	global: 'Global',
	continental: 'Continental or multi-country',
	national: 'National',
	regional: 'Regional',
	local: 'Local or targeted'
};
const COVERAGE_TO_CODE = Object.fromEntries(Object.entries(COVERAGE_CODES).map(([code, value]) => [value, code]));

const CRITERION_PARAMS: Record<string, CriterionName> = {
	res: 'spatial_resolution_m',
	rev: 'revisit_days',
	bits: 'radiometric_bit_depth',
	cov: 'geographic_coverage'
};
const CRITERION_TO_PARAM = Object.fromEntries(Object.entries(CRITERION_PARAMS).map(([param, name]) => [name, param]));

export const KNOWN_PARAMS = new Set(['v', 'q', 'fam', 'scope', 'mim', 'unk', 'prov', 'sensor', 'ops', 'src', 'sl', 'cmp', 'fields', 'p', ...Object.keys(CRITERION_PARAMS)]);

export interface ParsedUrlState {
	state: ExplorerState;
	/** True when the URL carries an explicit `v` parameter (explicit state wins over session defaults). */
	explicit: boolean;
	/** Recoverable problems; invalid portions were ignored. */
	issues: string[];
}

function cleanText(value: string, max: number, label: string, issues: string[]): string {
	// Control characters are not meaningful in search text.
	const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ');
	if (Array.from(text).length > max) {
		issues.push(`${label} was longer than ${max} characters and was shortened.`);
		return Array.from(text).slice(0, max).join('');
	}
	return text;
}

function parseList(params: URLSearchParams, key: string, label: string, issues: string[]): string[] {
	const values = params.getAll(key).map((value) => value.trim()).filter(Boolean);
	const unique = [...new Set(values)];
	if (unique.length !== values.length) issues.push(`Duplicate ${label} values were ignored.`);
	const bounded = unique.filter((value) => value.length <= LIMITS.listItem);
	if (bounded.length !== unique.length) issues.push(`Over-long ${label} values were ignored.`);
	if (bounded.length > LIMITS.listItems) {
		issues.push(`Only the first ${LIMITS.listItems} ${label} values were used.`);
		return bounded.slice(0, LIMITS.listItems);
	}
	return bounded;
}

function parseIds(raw: string | null, label: string, issues: string[]): string[] {
	if (!raw) return [];
	const values = raw.split(',').map((value) => value.trim()).filter(Boolean);
	const valid = values.filter((value) => PRODUCT_ID_PATTERN.test(value));
	if (valid.length !== values.length) issues.push(`Some ${label} identifiers were not valid product IDs and were ignored.`);
	const unique = [...new Set(valid)];
	if (unique.length !== valid.length) issues.push(`Duplicate ${label} identifiers were ignored.`);
	return unique;
}

function parseNumber(text: string): number | null {
	if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
	const value = Number(text);
	return Number.isFinite(value) ? value : null;
}

export function parseUrlState(params: URLSearchParams): ParsedUrlState {
	const issues: string[] = [];
	const state = cloneState(NEUTRAL_STATE);
	const explicit = params.has('v');
	if (explicit && params.get('v') !== URL_VERSION) {
		issues.push('This link uses an unsupported format version; settings were read where possible.');
	}
	const unknown = [...new Set([...params.keys()].filter((key) => !KNOWN_PARAMS.has(key)))];
	if (unknown.length) issues.push(`Unrecognised link settings were ignored: ${unknown.join(', ')}.`);

	if (params.has('q')) state.search = cleanText(params.get('q') ?? '', LIMITS.search, 'Search', issues);
	const fam = params.get('fam');
	if (fam) {
		if (FAMILY_CODES[fam]) state.family = FAMILY_CODES[fam]!;
		else issues.push('An unknown measurement family was ignored; showing all families.');
	}
	const scope = params.get('scope');
	if (scope) {
		if (SCOPE_CODES[scope]) state.scope = SCOPE_CODES[scope]!;
		else issues.push('An unknown catalogue scope was ignored; showing CEOS-ARD assessed products.');
	}
	const mim = params.get('mim');
	if (mim !== null) {
		if (mim === '1') state.includeMim = true;
		else if (mim !== '0') issues.push('The MIM setting was not recognised and was ignored.');
	}
	const unk = params.get('unk');
	if (unk !== null) {
		if (unk === 'hide') state.hideUnknown = true;
		else if (unk !== 'keep') issues.push('The unreported-values setting was not recognised and was ignored.');
	}
	state.providers = parseList(params, 'prov', 'provider', issues);
	state.operational = parseList(params, 'ops', 'operational status', issues);
	state.sources = parseList(params, 'src', 'record source', issues);
	if (params.has('sensor')) state.sensor = cleanText(params.get('sensor') ?? '', LIMITS.sensor, 'Sensor text', issues);

	for (const [param, name] of Object.entries(CRITERION_PARAMS)) {
		const raw = params.get(param);
		if (raw === null) continue;
		const definition = CRITERION_BY_NAME[name];
		const [modeCode, valueText = ''] = raw.split(':', 2) as [string, string?];
		const mode = MODE_CODES[modeCode];
		if (!mode) {
			issues.push(`${definition.label}: the importance “${modeCode}” was not recognised; the criterion was ignored.`);
			continue;
		}
		if (definition.kind === 'enum') {
			const value = COVERAGE_CODES[valueText];
			if (!value) {
				issues.push(`${definition.label}: the value was not recognised; the criterion was ignored.`);
				continue;
			}
			state.criteria[name] = { mode, value };
		} else {
			const value = parseNumber(valueText);
			if (value === null || value < definition.min || value > definition.max || (definition.integer && !Number.isInteger(value))) {
				issues.push(`${definition.label}: the value must be ${definition.integer ? 'a whole number ' : ''}between ${definition.min} and ${definition.max} ${definition.unit}; the criterion was ignored.`);
				continue;
			}
			state.criteria[name] = { mode, value };
		}
	}

	const shortlist = parseIds(params.get('sl'), 'shortlist', issues);
	if (shortlist.length > SHORTLIST_MAX) {
		issues.push(`This link lists ${shortlist.length} shortlisted products; only ${SHORTLIST_MAX} are supported. The first ${SHORTLIST_MAX} were restored — ask the sender for the copied selection summary for the rest.`);
	}
	state.shortlist = shortlist.slice(0, SHORTLIST_MAX);
	const compare = parseIds(params.get('cmp'), 'comparison', issues);
	if (compare.length > COMPARE_MAX) {
		issues.push(`Only ${COMPARE_MAX} products can be compared; the first ${COMPARE_MAX} were restored and the others kept on the shortlist.`);
	}
	state.compare = compare.slice(0, COMPARE_MAX);
	for (const id of compare) {
		if (!state.shortlist.includes(id) && state.shortlist.length < SHORTLIST_MAX) state.shortlist.push(id);
	}
	state.compare = state.compare.filter((id) => state.shortlist.includes(id));

	const fields = (params.get('fields') ?? '').split(',').filter(Boolean);
	state.fields = [...new Set(fields.filter((field) => OPTIONAL_GROUP_IDS.includes(field)))];
	if (state.fields.length !== fields.length) issues.push('Unknown comparison field groups were ignored.');

	const profileId = params.get('p');
	if (profileId) {
		if (/^[a-z0-9-]{1,64}$/.test(profileId) && !profileId.startsWith('custom-')) state.profileId = profileId;
		else issues.push('Custom profiles are not shared by links; the criteria in the link were used instead.');
	}
	return { state, explicit, issues };
}

function formatValue(value: number): string {
	// Plain decimal notation, no exponent, no trailing zeros.
	const text = value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
	return text === '-0' ? '0' : text;
}

/** Canonical serialisation; defaults are omitted. */
export function serialiseUrlState(state: ExplorerState): URLSearchParams {
	const params = new URLSearchParams();
	params.set('v', URL_VERSION);
	if (state.search.trim()) params.set('q', state.search);
	if (state.family !== ALL_FAMILIES && FAMILY_TO_CODE[state.family]) params.set('fam', FAMILY_TO_CODE[state.family]!);
	if (state.scope !== NEUTRAL_STATE.scope) params.set('scope', SCOPE_TO_CODE[state.scope]!);
	if (state.includeMim) params.set('mim', '1');
	if (state.hideUnknown) params.set('unk', 'hide');
	for (const provider of state.providers) params.append('prov', provider);
	if (state.sensor.trim()) params.set('sensor', state.sensor);
	for (const status of state.operational) params.append('ops', status);
	for (const source of state.sources) params.append('src', source);
	for (const [name, param] of Object.entries(CRITERION_TO_PARAM)) {
		const setting = state.criteria[name as CriterionName];
		if (!setting) continue;
		const definition = CRITERION_BY_NAME[name as CriterionName];
		const value = definition.kind === 'enum' ? COVERAGE_TO_CODE[String(setting.value)] : formatValue(Number(setting.value));
		if (value !== undefined) params.set(param, `${MODE_TO_CODE[setting.mode]}:${value}`);
	}
	if (state.shortlist.length) params.set('sl', state.shortlist.join(','));
	if (state.compare.length) params.set('cmp', state.compare.join(','));
	if (state.fields.length) params.set('fields', state.fields.join(','));
	if (state.profileId && !state.profileId.startsWith('custom-')) params.set('p', state.profileId);
	return params;
}

export function queryString(state: ExplorerState): string {
	return serialiseUrlState(state).toString();
}

export { COVERAGE_LEVELS };
