/**
 * Profile application, modification detection and custom-profile validation.
 *
 * Built-in profiles are illustrative starting points. Applying one sets exactly what the
 * prototype's `set_profile_defaults` set (criteria, family, assessment scope, unreported
 * values); every other constraint and all selections are retained.
 */
import { CRITERIA, CRITERION_BY_NAME, NO_COVERAGE_REQUIREMENT, describeTarget, isActiveMode, MODE_LABELS } from './criteria';
import { cloneState, type ExplorerState } from './explorer';
import { ALL_FAMILIES, CEOS_FILTERS } from './filters';
import { casefold, collapseWhitespace } from './text';
import type { CeosFilter, CriterionName, Criteria, Profile } from './types';

export const PRODUCT_FAMILIES = [
	ALL_FAMILIES,
	'Surface Reflectance',
	'Surface Temperature',
	'Synthetic Aperture Radar',
	'Aquatic Reflectance',
	'Night-time Lights'
] as const;

export const PROFILE_NAME_MAX = 80;
export const PROFILE_DESCRIPTION_MAX = 280;

/** Port of `profile_default_family`. */
export function profileDefaultFamily(profile: Pick<Profile, 'default_product_family' | 'product_families'>): string {
	return profile.default_product_family || profile.product_families[0] || ALL_FAMILIES;
}

export interface ProfileSettings {
	family: string;
	scope: CeosFilter;
	hideUnknown: boolean;
	criteria: ExplorerState['criteria'];
}

function asScope(value: unknown): CeosFilter {
	return CEOS_FILTERS.includes(value as CeosFilter) ? (value as CeosFilter) : 'CEOS-ARD assessed only';
}

/**
 * What applying a profile sets (port of `set_profile_defaults`). Criteria the profile does
 * not use are left unset rather than shown as ignored values.
 */
export function profileSettings(profile: Profile): ProfileSettings {
	const criteria: ExplorerState['criteria'] = {};
	for (const definition of CRITERIA) {
		const setting = profile.criteria[definition.name];
		if (!setting || !isActiveMode(setting.mode)) continue;
		const value = setting.value ?? definition.defaultValue;
		if (definition.kind === 'enum' && !definition.options.includes(String(value))) continue;
		criteria[definition.name] = { mode: setting.mode, value };
	}
	return {
		family: profileDefaultFamily(profile),
		scope: asScope(profile.filter_defaults?.ceos_filter),
		hideUnknown: !(profile.filter_defaults?.show_unknown ?? true),
		criteria
	};
}

export interface ProfileChange {
	label: string;
	from: string;
	to: string;
}

function describeSetting(name: CriterionName, setting: { mode: string; value: unknown } | undefined): string {
	if (!setting) return 'Not set';
	if (!isActiveMode(setting.mode)) return `Ignored (${describeTarget(name, setting.value)})`;
	return `${describeTarget(name, setting.value)} · ${MODE_LABELS[setting.mode]}`;
}

function scopeLabel(scope: CeosFilter): string {
	return SCOPE_LABELS[scope];
}

export const SCOPE_LABELS: Record<CeosFilter, string> = {
	'CEOS-ARD assessed only': 'CEOS-ARD assessed products',
	'All statuses': 'All available statuses',
	'Assessment in progress': 'Assessment in progress',
	'Not assessed or status unknown': 'Not assessed or status unknown'
};

export interface ProfilePreview {
	changes: ProfileChange[];
	retained: string[];
	next: ExplorerState;
}

/** Preview and result of applying a profile: what it replaces and what it leaves in place. */
export function previewProfile(state: ExplorerState, profile: Profile): ProfilePreview {
	const settings = profileSettings(profile);
	const changes: ProfileChange[] = [];
	if (state.family !== settings.family) changes.push({ label: 'Measurement family', from: state.family, to: settings.family });
	if (state.scope !== settings.scope) changes.push({ label: 'Catalogue scope', from: scopeLabel(state.scope), to: scopeLabel(settings.scope) });
	if (state.hideUnknown !== settings.hideUnknown) {
		changes.push({ label: 'Records with unreported values', from: state.hideUnknown ? 'Hidden' : 'Kept', to: settings.hideUnknown ? 'Hidden' : 'Kept' });
	}
	for (const definition of CRITERIA) {
		const before = describeSetting(definition.name, state.criteria[definition.name]);
		const after = describeSetting(definition.name, settings.criteria[definition.name]);
		if (before !== after) changes.push({ label: definition.label, from: before, to: after });
	}
	const retained: string[] = [];
	if (state.search.trim()) retained.push(`Search “${state.search.trim()}”`);
	if (state.providers.length) retained.push(`Providers: ${state.providers.join(', ')}`);
	if (state.sensor.trim()) retained.push(`Sensor or instrument type contains “${state.sensor.trim()}”`);
	if (state.operational.length) retained.push(`Operational status: ${state.operational.join(', ')}`);
	if (state.sources.length) retained.push(`Record sources: ${state.sources.join(', ')}`);
	if (state.includeMim) retained.push('MIM records included when loaded');
	if (state.shortlist.length) retained.push(`Shortlist (${state.shortlist.length}) and comparison (${state.compare.length})`);
	const next = cloneState(state);
	next.family = settings.family;
	next.scope = settings.scope;
	next.hideUnknown = settings.hideUnknown;
	next.criteria = structuredClone(settings.criteria);
	next.profileId = profile.id;
	return { changes, retained, next };
}

/**
 * Whether the profile-managed settings differ from the profile's values. Unlike the
 * prototype's `filters_changed`, coverage is included (bug fix) and independent
 * constraints such as search are reported as retained rather than "Modified".
 */
export function profileModified(state: ExplorerState, profile: Profile): boolean {
	const settings = profileSettings(profile);
	if (state.family !== settings.family || state.scope !== settings.scope || state.hideUnknown !== settings.hideUnknown) return true;
	for (const definition of CRITERIA) {
		const a = state.criteria[definition.name];
		const b = settings.criteria[definition.name];
		const activeA = Boolean(a && isActiveMode(a.mode));
		const activeB = Boolean(b && isActiveMode(b.mode));
		if (activeA !== activeB) return true;
		if (activeA && activeB && (a!.mode !== b!.mode || String(a!.value) !== String(b!.value))) return true;
	}
	return false;
}

// ---------------------------------------------------------------- legacy parity helpers

export interface LegacyToggles {
	use_spatial: boolean;
	spatial_limit: number;
	use_revisit: boolean;
	revisit_limit: number;
	use_bit_depth: boolean;
	min_bit_depth: number;
	coverage_filter: string;
}

/** Port of `build_active_profile` (prototype semantics: enabling a criterion reuses the profile's mode, else Preferred). */
export function legacyBuildActiveProfile(selected: Profile, toggles: LegacyToggles): Profile {
	const criteria: Criteria = structuredClone(selected.criteria);
	const rows: [string, keyof LegacyToggles, keyof LegacyToggles][] = [
		['spatial_resolution_m', 'use_spatial', 'spatial_limit'],
		['revisit_days', 'use_revisit', 'revisit_limit'],
		['radiometric_bit_depth', 'use_bit_depth', 'min_bit_depth']
	];
	for (const [name, enabledKey, valueKey] of rows) {
		const original = criteria[name]?.mode ?? 'preferred';
		criteria[name] = {
			mode: toggles[enabledKey] ? (original !== 'not_used' ? original : 'preferred') : 'not_used',
			value: toggles[valueKey] as number
		};
	}
	const originalCoverage = criteria.geographic_coverage?.mode ?? 'preferred';
	criteria.geographic_coverage = {
		mode: toggles.coverage_filter !== NO_COVERAGE_REQUIREMENT ? (originalCoverage !== 'not_used' ? originalCoverage : 'preferred') : 'not_used',
		value: toggles.coverage_filter
	};
	return { ...structuredClone(selected), criteria };
}

export interface LegacyFilterSession extends LegacyToggles {
	family_filter: string;
	ceos_filter: string;
	show_unknown: boolean;
	advanced_search: string;
	provider_filter: string[];
	sensor_filter: string;
	operational_filter: string[];
	source_filter: string[];
}

/** Port of `filters_changed` (including its omission of coverage), kept for parity tests. */
export function legacyFiltersChanged(selected: Profile, session: LegacyFilterSession): boolean {
	const rows: [string, keyof LegacyToggles, keyof LegacyToggles][] = [
		['spatial_resolution_m', 'use_spatial', 'spatial_limit'],
		['revisit_days', 'use_revisit', 'revisit_limit'],
		['radiometric_bit_depth', 'use_bit_depth', 'min_bit_depth']
	];
	for (const [criterion, useKey, valueKey] of rows) {
		const setting = selected.criteria[criterion] ?? { mode: 'not_used', value: null };
		if (session[useKey] !== (setting.mode !== 'not_used')) return true;
		if (session[useKey] && Number(session[valueKey]) !== Number(setting.value)) return true;
	}
	if (session.family_filter !== profileDefaultFamily(selected)) return true;
	const expectedCeos = selected.filter_defaults.ceos_filter ?? 'CEOS-ARD assessed only';
	const expectedUnknown = Boolean(selected.filter_defaults.show_unknown ?? true);
	if (session.ceos_filter !== expectedCeos || session.show_unknown !== expectedUnknown) return true;
	return Boolean(session.advanced_search || session.provider_filter.length || session.sensor_filter || session.operational_filter.length || session.source_filter.length);
}

// ---------------------------------------------------------------- custom profiles

/** Port of `normalise_profile_name`. */
export function normaliseProfileName(value: string): string {
	return collapseWhitespace(value);
}

/** Port of `custom_profile_name_error`, plus a maximum length. */
export function profileNameError(name: string, profiles: Pick<Profile, 'id' | 'name'>[], excludeId: string | null = null): string | null {
	const length = Array.from(name).length;
	if (length < 3) return 'Enter a profile name with at least three characters.';
	if (length > PROFILE_NAME_MAX) return `Enter a profile name of at most ${PROFILE_NAME_MAX} characters.`;
	if (profiles.some((profile) => profile.id !== excludeId && casefold(profile.name) === casefold(name))) {
		return 'A profile with that name already exists.';
	}
	return null;
}

export interface CustomProfileInput {
	id: string;
	name: string;
	description: string;
	family: string;
	scope: CeosFilter;
	hideUnknown: boolean;
	criteria: ExplorerState['criteria'];
}

/** Build a session-only profile in the prototype's `Profile.to_dict` shape. */
export function buildCustomProfile(input: CustomProfileInput): Profile {
	const criteria: Criteria = {};
	for (const definition of CRITERIA) {
		const setting = input.criteria[definition.name];
		criteria[definition.name] = setting ? { mode: setting.mode, value: setting.value } : { mode: 'not_used', value: definition.defaultValue };
	}
	const families = PRODUCT_FAMILIES.slice(1) as string[];
	return {
		id: input.id,
		name: normaliseProfileName(input.name),
		description: input.description.trim() || 'Reusable application-screening filter defaults.',
		use_case_category: 'User-defined profile',
		product_families: input.family === ALL_FAMILIES ? families : [input.family],
		criteria,
		default_product_family: input.family,
		filter_defaults: { ceos_filter: input.scope, show_unknown: !input.hideUnknown },
		radiometric_screening: 'PFS baseline',
		geometric_screening: 'Manual task check',
		notes: null,
		assumptions: 'User-defined profile configured with the existing application-screening filter model.',
		built_in: false
	};
}

export function customInputFromState(state: ExplorerState, id: string, name = '', description = ''): CustomProfileInput {
	return {
		id,
		name,
		description,
		family: state.family,
		scope: state.scope,
		hideUnknown: state.hideUnknown,
		criteria: structuredClone(state.criteria)
	};
}

export function customInputFromProfile(profile: Profile): CustomProfileInput {
	const settings = profileSettings(profile);
	return {
		id: profile.id,
		name: profile.name,
		description: profile.description,
		family: settings.family,
		scope: settings.scope,
		hideUnknown: settings.hideUnknown,
		criteria: settings.criteria
	};
}

/** Validate a profile read back from browser storage; returns null when unusable. */
export function validateStoredProfile(value: unknown): Profile | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (typeof record.id !== 'string' || !/^custom-[A-Za-z0-9-]{1,64}$/.test(record.id)) return null;
	if (typeof record.name !== 'string' || normaliseProfileName(record.name).length < 3 || record.name.length > PROFILE_NAME_MAX * 2) return null;
	if (!record.criteria || typeof record.criteria !== 'object' || Array.isArray(record.criteria)) return null;
	const family = typeof record.default_product_family === 'string' && (PRODUCT_FAMILIES as readonly string[]).includes(record.default_product_family) ? record.default_product_family : ALL_FAMILIES;
	const filterDefaults = (record.filter_defaults && typeof record.filter_defaults === 'object' ? record.filter_defaults : {}) as Record<string, unknown>;
	const criteria: ExplorerState['criteria'] = {};
	for (const definition of CRITERIA) {
		const raw = (record.criteria as Record<string, unknown>)[definition.name] as Record<string, unknown> | undefined;
		if (!raw || typeof raw !== 'object') continue;
		const mode = raw.mode === 'required' || raw.mode === 'preferred' || raw.mode === 'not_used' ? raw.mode : null;
		if (!mode) return null;
		if (definition.kind === 'number') {
			const number = Number(raw.value);
			if (!Number.isFinite(number) || number < definition.min || number > definition.max) return null;
			criteria[definition.name] = { mode, value: definition.integer ? Math.trunc(number) : number };
		} else {
			const text = String(raw.value);
			if (text === NO_COVERAGE_REQUIREMENT) criteria[definition.name] = { mode: 'not_used', value: definition.defaultValue };
			else if (definition.options.includes(text)) criteria[definition.name] = { mode, value: text };
			else return null;
		}
	}
	return buildCustomProfile({
		id: record.id,
		name: record.name,
		description: typeof record.description === 'string' ? record.description.slice(0, PROFILE_DESCRIPTION_MAX) : '',
		family,
		scope: asScope(filterDefaults.ceos_filter),
		hideUnknown: !(filterDefaults.show_unknown ?? true),
		criteria
	});
}

export function newCustomProfileId(random: () => string = () => crypto.randomUUID().replaceAll('-', '').slice(0, 10)): string {
	return `custom-${random()}`;
}

export const CRITERION_LABEL = (name: CriterionName) => CRITERION_BY_NAME[name].label;
