/**
 * Purpose-led entry: typed, versioned guidance and the explicit answer-to-settings mapping.
 *
 * Mapping version 2 rules (documented in docs/purpose-journey/GUIDANCE.md):
 * - Theme (Q1) selects guidance and checks. It never filters.
 * - Need (Q2) proposes the measurement family and is the only answer that filters. Needs that
 *   two families serve keep both; "not sure" keeps every family.
 * - Use (Q3) and period (Q5) add checks. They never filter or order.
 * - Where (Q4), smallest feature (Q6) and frequency (Q7) set Preferred criteria from the band
 *   stated beside each option. Preferred orders results; it never hides a product.
 * - Values the user types in "Set a technical limit yourself" replace the band, with the mode
 *   the user chose.
 * Pure: no UI, storage or network.
 */
import { CRITERION_BY_NAME, describeTarget, MODE_LABELS } from './criteria';
import { cloneState, type ExplorerState } from './explorer';
import { accessAction, safeUrl } from './facts';
import { ALL_FAMILIES, OPTICAL_AND_RADAR } from './filters';
import { familyLabel } from './guidance';
import type { ProfileChange } from './profiles';
import type { CriterionMode, Product } from './types';

// ------------------------------------------------------------------ guidance model

export type GuidanceStatus = 'illustrative' | 'general' | 'reviewed';
export type NextActionKind = 'access' | 'documentation' | 'assessment' | 'quality' | `external:${string}`;
/** Short family codes used in guidance: optical, radar, thermal, aquatic. */
export type FamilyCode = 'sr' | 'sar' | 'st' | 'ar';

export interface GuidanceSource {
	id: string;
	/** Short display label; the full title and publisher go into copied summaries. */
	short: string;
	title: string;
	publisher: string;
	year: number;
	url: string;
}
export interface Option {
	id: string;
	label: string;
	/** Optional one-line explanation shown in the choice menu. */
	hint?: string;
}
export interface NeedOption extends Option {
	families: FamilyCode[];
	/** Themes this need is offered for; null means every theme. */
	themes: string[] | null;
	explanation: string;
}
export interface RegionOption extends Option {
	/** Reported coverage level this answer prefers; null sets no preference. */
	coverage: string | null;
	/** Wording inside the purpose sentence, e.g. "across a continent or region". */
	phrase: string;
}
export interface TimeframeOption extends Option {
	/** Whole years back from the current year, used only to show an example range. */
	years_back?: number;
	/** Wording inside the purpose sentence; absent for typed years. */
	phrase?: string;
}
export interface DetailOption extends Option {
	resolution_m: number | null;
	visual: VisualDetail;
}
export interface FrequencyOption extends Option {
	revisit_days: number | null;
}
export type ExperienceLevel = 'new' | 'familiar' | 'specialist';

/**
 * Default open state of disclosures by self-described experience. Only defaults: anything
 * the user opens or closes is remembered and wins. Filters are never changed.
 */
export const EXPERIENCE_DISCLOSURE: Record<ExperienceLevel, Record<string, boolean>> = {
	new: { 'family-help': true, 'more-filters': false, 'detail:qualifications': true },
	familiar: {},
	specialist: { 'more-filters': true, 'detail:technical': true, 'detail:instrument': true, 'detail:provenance': true, 'purpose:setup': true }
};

export interface CheckCondition {
	uses?: string[];
	/** Family codes, or `decide` for a need with no family. */
	families?: string[];
	timeframes?: string[];
	details?: string[];
	frequencies?: string[];
}
export interface GuidanceCheck {
	id: string;
	label: string;
	why: string;
	next: NextActionKind[];
	sources: string[];
	when?: CheckCondition;
	/** More specific checks replace general ones with these ids. */
	replaces?: string[];
}
export interface GuidanceEntry {
	id: string;
	status: GuidanceStatus;
	summary?: string;
	applies: { themes: string[] | null; needs: string[] | null; uses: string[] | null };
	assumptions: string[];
	checks: GuidanceCheck[];
	/** Notes keyed by family code, `both` (optical and radar) or `decide`. */
	family_notes: Record<string, string>;
	/** Notes keyed by use id. */
	use_notes: Record<string, string>;
}
export interface Guidance {
	schema: 2;
	version: string;
	mapping_version: number;
	status: GuidanceStatus;
	review: { reviewed: boolean; note: string };
	updated: string;
	sources: GuidanceSource[];
	themes: Option[];
	needs: NeedOption[];
	uses: Option[];
	regions: RegionOption[];
	timeframes: TimeframeOption[];
	details: DetailOption[];
	frequencies: FrequencyOption[];
	experience: (Option & { id: ExperienceLevel })[];
	guidance: GuidanceEntry[];
}

export class GuidanceError extends Error {}

const FAMILY_CODES: Record<FamilyCode, string> = {
	sr: 'Surface Reflectance',
	sar: 'Synthetic Aperture Radar',
	st: 'Surface Temperature',
	ar: 'Aquatic Reflectance'
};
const COVERAGE_LEVELS = new Set(['Global', 'Continental or multi-country', 'National', 'Regional', 'Local or targeted']);

/** Structural validation of the version-controlled guidance file. */
export function loadGuidance(raw: unknown): Guidance {
	if (!raw || typeof raw !== 'object') throw new GuidanceError('Guidance file is not an object.');
	const g = raw as Guidance;
	if (g.schema !== 2) throw new GuidanceError('Unsupported guidance schema.');
	if (typeof g.version !== 'string' || !g.version) throw new GuidanceError('Guidance version is missing.');
	for (const key of ['sources', 'themes', 'needs', 'uses', 'regions', 'timeframes', 'details', 'frequencies', 'experience', 'guidance'] as const) {
		if (!Array.isArray(g[key])) throw new GuidanceError(`Guidance "${key}" must be a list.`);
		const ids = (g[key] as { id: string }[]).map((item) => item.id);
		if (ids.some((id) => typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id))) throw new GuidanceError(`Guidance "${key}" has an invalid id.`);
		if (new Set(ids).size !== ids.length) throw new GuidanceError(`Guidance "${key}" has duplicate ids.`);
	}
	for (const source of g.sources) {
		if (![source.short, source.title, source.publisher].every((v) => typeof v === 'string' && v.trim()) || !Number.isInteger(source.year) || !/^https:\/\//.test(source.url)) {
			throw new GuidanceError(`Source ${source.id} needs a short label, title, publisher, year and https URL.`);
		}
	}
	if (g.experience.some((e) => !['new', 'familiar', 'specialist'].includes(e.id))) throw new GuidanceError('Unknown experience level.');
	const themeIds = new Set(g.themes.map((t) => t.id));
	for (const need of g.needs) {
		if (!Array.isArray(need.families) || need.families.some((code) => !(code in FAMILY_CODES))) throw new GuidanceError(`Need ${need.id} has an unknown family.`);
		if (need.themes !== null && (!Array.isArray(need.themes) || need.themes.some((id) => !themeIds.has(id)))) throw new GuidanceError(`Need ${need.id} names an unknown theme.`);
		if (familyFor(need.families) === null) throw new GuidanceError(`Need ${need.id} combines families the explorer cannot filter together.`);
	}
	for (const region of g.regions) if (region.coverage !== null && !COVERAGE_LEVELS.has(region.coverage)) throw new GuidanceError(`Region ${region.id} has an unknown coverage level.`);
	const inRange = (value: number | null, name: 'spatial_resolution_m' | 'revisit_days') => {
		const d = CRITERION_BY_NAME[name];
		return value === null || (d.kind === 'number' && Number.isFinite(value) && value >= d.min && value <= d.max);
	};
	for (const detail of g.details) if (!inRange(detail.resolution_m, 'spatial_resolution_m')) throw new GuidanceError(`Detail ${detail.id} has an invalid resolution.`);
	for (const frequency of g.frequencies) if (!inRange(frequency.revisit_days, 'revisit_days')) throw new GuidanceError(`Frequency ${frequency.id} has an invalid revisit.`);
	const sourceIds = new Set(g.sources.map((s) => s.id));
	for (const entry of g.guidance) {
		for (const check of entry.checks) {
			for (const source of check.sources) if (!sourceIds.has(source)) throw new GuidanceError(`Check ${check.id} cites unknown source ${source}.`);
			for (const next of check.next) {
				if (next.startsWith('external:') ? !sourceIds.has(next.slice(9)) : !['access', 'documentation', 'assessment', 'quality'].includes(next)) {
					throw new GuidanceError(`Check ${check.id} has an invalid next action ${next}.`);
				}
			}
		}
	}
	return g;
}

/** The explorer family filter value for a set of family codes (null when it cannot be expressed). */
export function familyFor(codes: FamilyCode[]): string | null {
	if (!codes.length) return ALL_FAMILIES;
	const sorted = [...new Set(codes)].sort().join('+');
	if (sorted === 'sar+sr') return OPTICAL_AND_RADAR;
	if (codes.length === 1) return FAMILY_CODES[codes[0]!];
	return null;
}

// ------------------------------------------------------------------ answers

export interface UserCriterion {
	mode: CriterionMode;
	value: number;
}
export interface CoverageSetting {
	mode: CriterionMode;
	value: string;
}

export interface PurposeAnswers {
	/** Q1: what the work is about. Selects guidance; never filters. */
	theme: string | null;
	themeText: string;
	/** Q2: what the user needs to see or measure. Proposes the family filter. */
	need: string | null;
	/** Q3: how the data will be used. Adds checks. */
	use: string | null;
	/** Q4: geographic scale. Sets Preferred reported coverage. */
	region: string | null;
	/** Q5: the period needed. Adds checks. Typed years are private. */
	timeframe: string | null;
	period: string;
	/** Q6: smallest thing to tell apart. Sets Preferred spatial resolution. */
	detail: string | null;
	/** Q7: how often a usable look is needed. Sets Preferred nominal revisit for the first two bands. */
	frequency: string | null;
	/** "Show technical detail": changes only which details open by default; never filters. */
	experience: ExperienceLevel | null;
	/** Private notes kept with the shortlist; never used for matching or put in links. */
	notes: string;
	/** Optional technical settings the user typed; they replace the band. */
	resolution: UserCriterion | null;
	revisit: UserCriterion | null;
}

export const EMPTY_ANSWERS: PurposeAnswers = Object.freeze({
	theme: null,
	themeText: '',
	need: null,
	use: null,
	region: null,
	timeframe: null,
	period: '',
	detail: null,
	frequency: null,
	experience: null,
	notes: '',
	resolution: null,
	revisit: null
}) as PurposeAnswers;

export const TEXT_MAX = 160;
export const NOTES_MAX = 400;

const byId = <T extends { id: string }>(list: T[], id: string | null) => (id ? list.find((item) => item.id === id) : undefined);

/** Needs offered for a theme, in guidance order; every need when no theme or a custom theme. */
export function needsFor(g: Guidance, theme: string | null): NeedOption[] {
	if (!theme || theme === 'custom') return g.needs;
	return g.needs.filter((need) => !need.themes || need.themes.includes(theme));
}

/** Answers are useful enough to propose settings: a theme and a need have been chosen. */
export function hasPurpose(answers: PurposeAnswers): boolean {
	const theme = Boolean(answers.theme && (answers.theme !== 'custom' || answers.themeText.trim()));
	return theme && Boolean(answers.need);
}

/** Validate untrusted (session) answers against the guidance; unknown ids are dropped. */
export function sanitiseAnswers(raw: unknown, g: Guidance): PurposeAnswers {
	const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const id = (list: { id: string }[], v: unknown) => (typeof v === 'string' && list.some((item) => item.id === v) ? v : null);
	const text = (v: unknown, max = TEXT_MAX) => (typeof v === 'string' ? v.slice(0, max) : '');
	const criterion = (v: unknown, name: 'spatial_resolution_m' | 'revisit_days'): UserCriterion | null => {
		if (!v || typeof v !== 'object') return null;
		const c = v as Record<string, unknown>;
		const definition = CRITERION_BY_NAME[name];
		const number = Number(c.value);
		if (definition.kind !== 'number' || !Number.isFinite(number) || number < definition.min || number > definition.max) return null;
		return c.mode === 'required' || c.mode === 'preferred' || c.mode === 'not_used' ? { mode: c.mode, value: number } : null;
	};
	const answers: PurposeAnswers = {
		theme: id(g.themes, value.theme),
		themeText: text(value.themeText),
		need: id(g.needs, value.need),
		use: id(g.uses, value.use),
		region: id(g.regions, value.region),
		timeframe: id(g.timeframes, value.timeframe),
		period: text(value.period),
		detail: id(g.details, value.detail),
		frequency: id(g.frequencies, value.frequency),
		experience: id(g.experience, value.experience) as ExperienceLevel | null,
		notes: text(value.notes, NOTES_MAX),
		resolution: criterion(value.resolution, 'spatial_resolution_m'),
		revisit: criterion(value.revisit, 'revisit_days')
	};
	if (answers.theme !== 'custom') answers.themeText = '';
	if (answers.timeframe !== 'custom') answers.period = '';
	if (answers.need && !needsFor(g, answers.theme).some((n) => n.id === answers.need)) answers.need = null;
	return answers;
}

// ------------------------------------------------------------------ public key (URL)

/** Public, non-private purpose key built only from fixed ids: `theme~need~use`. */
export function purposeKey(answers: PurposeAnswers): string | null {
	if (!answers.theme) return null;
	return [answers.theme, answers.need ?? '-', answers.use ?? '-'].join('~');
}

export interface ParsedKey {
	theme: string;
	need: string | null;
	use: string | null;
}

export function parsePurposeKey(key: string | null, g: Guidance): ParsedKey | null {
	if (!key) return null;
	const [theme, need, use] = key.split('~');
	if (!byId(g.themes, theme ?? null)) return null;
	if (need && need !== '-' && !byId(g.needs, need)) return null;
	if (use && use !== '-' && !byId(g.uses, use)) return null;
	return { theme: theme!, need: need && need !== '-' ? need : null, use: use && use !== '-' ? use : null };
}

export function answersFromKey(parsed: ParsedKey): PurposeAnswers {
	return { ...structuredClone(EMPTY_ANSWERS), theme: parsed.theme, need: parsed.need, use: parsed.use };
}

// ------------------------------------------------------------------ wording

/**
 * One readable sentence. Private text (custom theme) is included only when `includePrivate`
 * is set — never in shared or URL-derived wording.
 */
export function purposeSentence(answers: PurposeAnswers, g: Guidance, { includePrivate = true } = {}): string {
	const theme = byId(g.themes, answers.theme);
	if (!theme) return 'No purpose described yet.';
	const themeText = theme.id === 'custom' ? (includePrivate && answers.themeText.trim() ? answers.themeText.trim() : 'another topic') : theme.label;
	const need = byId(g.needs, answers.need);
	const use = byId(g.uses, answers.use);
	const needText = need && need.id !== 'unsure' ? `, needing to see ${need.label}` : '';
	const useText = use ? `, to ${use.label}` : '';
	const place = includePrivate ? placeAndTime(answers, g) : '';
	return `My work is about ${themeText}${needText}${useText}${place ? `, ${place}` : ''}.`;
}

/** Private scale and period wording, e.g. "within one country over a long record (20 years or more)". */
export function placeAndTime(answers: PurposeAnswers, g: Guidance): string {
	const region = byId(g.regions, answers.region);
	const timeframe = byId(g.timeframes, answers.timeframe);
	const parts: string[] = [];
	if (region) parts.push(region.phrase);
	if (timeframe) {
		if (timeframe.phrase) parts.push(timeframe.phrase);
		else if (answers.period.trim()) parts.push(`during ${answers.period.trim()}`);
	}
	return parts.join(' ');
}

/** Private context lines for summaries ("Area: one country", "Period: recent only (2024–2026)"). */
export function contextLines(answers: PurposeAnswers, g: Guidance, now = new Date()): { area: string; period: string } {
	const region = byId(g.regions, answers.region);
	const timeframe = byId(g.timeframes, answers.timeframe);
	const area = region ? region.label : '';
	const period = timeframe ? (timeframe.id === 'custom' ? answers.period.trim() : `${timeframe.label}${timeframeRange(timeframe, now) ? ` (${timeframeRange(timeframe, now)})` : ''}`) : '';
	return { area, period };
}

/** Example year range for a relative timeframe, e.g. "2006–2026". */
export function timeframeRange(timeframe: TimeframeOption, now = new Date()): string | null {
	if (!timeframe.years_back) return null;
	const year = now.getFullYear();
	return `${year - timeframe.years_back}–${year}`;
}

/** How the data will be used (Q3), for summaries. Kept under its earlier name for callers. */
export function outputLabel(answers: PurposeAnswers, g: Guidance): string | null {
	return byId(g.uses, answers.use)?.label ?? null;
}

// ------------------------------------------------------------------ imagery state

export type VisualFamily = 'optical' | 'radar' | 'thermal' | 'neutral';
export type VisualDetail = 'fine' | 'coarse';

const VISUAL_BY_CODE: Record<FamilyCode, VisualFamily> = { sr: 'optical', sar: 'radar', st: 'thermal', ar: 'optical' };

/** Decorative background state. Never an input to filtering. */
export function visualState(answers: PurposeAnswers, g: Guidance): { family: VisualFamily; detail: VisualDetail } {
	const need = byId(g.needs, answers.need);
	const family = need && need.families.length === 1 ? VISUAL_BY_CODE[need.families[0]!] : need?.families.includes('sar') ? 'radar' : 'neutral';
	const detail = byId(g.details, answers.detail)?.visual ?? 'fine';
	return { family, detail };
}

// ------------------------------------------------------------------ guidance resolution

export function matchingGuidance(g: Guidance, answers: Pick<PurposeAnswers, 'theme' | 'need' | 'use'>): GuidanceEntry[] {
	const applies = (list: string[] | null, value: string | null) => !list || (value !== null && list.includes(value));
	return g.guidance.filter((entry) => applies(entry.applies.themes, answers.theme) && applies(entry.applies.needs, answers.need) && applies(entry.applies.uses, answers.use));
}

export interface ResolvedCheck extends GuidanceCheck {
	guidanceId: string;
	status: GuidanceStatus;
}

function familyCodesFor(g: Guidance, answers: PurposeAnswers): string[] {
	const need = byId(g.needs, answers.need);
	return need && need.families.length ? need.families : ['decide'];
}

function conditionHolds(when: CheckCondition | undefined, answers: PurposeAnswers, families: string[]): boolean {
	if (!when) return true;
	const has = (list: string[] | undefined, value: string | null) => !list || (value !== null && list.includes(value));
	if (when.families && !families.some((code) => when.families!.includes(code))) return false;
	return has(when.uses, answers.use) && has(when.timeframes, answers.timeframe) && has(when.details, answers.detail) && has(when.frequencies, answers.frequency);
}

export function resolveChecks(g: Guidance, answers: PurposeAnswers): ResolvedCheck[] {
	const checks: ResolvedCheck[] = [];
	const seen = new Set<string>();
	const families = familyCodesFor(g, answers);
	for (const entry of matchingGuidance(g, answers)) {
		for (const check of entry.checks) {
			if (seen.has(check.id) || !conditionHolds(check.when, answers, families)) continue;
			seen.add(check.id);
			checks.push({ ...check, guidanceId: entry.id, status: entry.status });
		}
	}
	const replaced = new Set(checks.flatMap((check) => check.replaces ?? []));
	return checks.filter((check) => !replaced.has(check.id));
}

/** The most specific guidance status that applies (illustrative beats general). */
export function guidanceStatus(g: Guidance, answers: PurposeAnswers): { status: GuidanceStatus | 'user'; label: string } {
	const entries = matchingGuidance(g, answers);
	if (entries.some((entry) => entry.status === 'illustrative')) {
		return { status: 'illustrative', label: `Illustrative guidance v${g.version} — not reviewed by CEOS or domain experts` };
	}
	if (answers.theme === 'custom') return { status: 'user', label: `Your own topic, with general checks v${g.version}` };
	return { status: 'general', label: `General checks v${g.version} — no theme-specific guidance yet` };
}

/** Guidance note about a family code (`sr`, `sar`, `st`, `both`, `decide`) for this purpose. */
export function measurementNote(g: Guidance, answers: PurposeAnswers, key: string | null): string | null {
	if (!key) return null;
	for (const entry of matchingGuidance(g, answers).reverse()) if (entry.family_notes[key]) return entry.family_notes[key]!;
	return null;
}

/** The note for the family the need proposes ("both" for optical and radar together). */
export function needNote(g: Guidance, answers: PurposeAnswers): string | null {
	const need = byId(g.needs, answers.need);
	if (!need) return null;
	const key = need.families.length === 0 ? 'decide' : need.families.length > 1 ? 'both' : need.families[0]!;
	return measurementNote(g, answers, key);
}

const FAMILY_TO_CODE: Record<string, string> = {
	'Surface Reflectance': 'sr',
	'Synthetic Aperture Radar': 'sar',
	'Surface Temperature': 'st'
};

export function productMeasurementNote(g: Guidance, answers: PurposeAnswers, product: Product): string | null {
	const key = product.product_family ? FAMILY_TO_CODE[product.product_family] : undefined;
	return key ? measurementNote(g, answers, key) : null;
}

/** Guidance note on getting from products to the user's use. Kept under its earlier name for callers. */
export function outputNote(g: Guidance, answers: PurposeAnswers): string | null {
	if (!answers.use) return null;
	for (const entry of matchingGuidance(g, answers).reverse()) if (entry.use_notes[answers.use]) return entry.use_notes[answers.use]!;
	return null;
}

export function assumptions(g: Guidance, answers: PurposeAnswers): string[] {
	return [...new Set(matchingGuidance(g, answers).flatMap((entry) => entry.assumptions))];
}

export function sourcesFor(g: Guidance, ids: string[]): GuidanceSource[] {
	return ids.map((id) => g.sources.find((source) => source.id === id)).filter((source): source is GuidanceSource => Boolean(source));
}

/** One short line on what the explorer does not verify, plus a note when area or period are set. */
export function qualitativeNotes(answers: PurposeAnswers): string[] {
	const notes = ['The explorer orders products by what they report. It does not check acquisitions over your area or period, and it does not establish suitability for your purpose.'];
	if (answers.notes.trim()) notes.push('Your notes stay in this browser tab with your shortlist. They are not used for matching or shared in links.');
	return notes;
}

// ------------------------------------------------------------------ proposal (mapping v2)

/** The settings the journey manages. Everything else in the explorer state is retained. */
export interface JourneySettings {
	family: string;
	spatial_resolution_m: UserCriterion | null;
	revisit_days: UserCriterion | null;
	geographic_coverage: CoverageSetting | null;
}

export interface ProposedSetting {
	label: string;
	value: string;
	mode: string;
	reason: string;
}

export interface PurposeProposal {
	settings: JourneySettings;
	proposed: ProposedSetting[];
	changes: ProfileChange[];
	retained: string[];
	notes: string[];
	need: NeedOption | null;
	/** Number of Preferred criteria the answers set (for the result line). */
	preferences: number;
	next: ExplorerState;
}

type JourneyCriterion = 'spatial_resolution_m' | 'revisit_days' | 'geographic_coverage';
const JOURNEY_CRITERIA: JourneyCriterion[] = ['geographic_coverage', 'spatial_resolution_m', 'revisit_days'];

function describeCriterionSetting(name: JourneyCriterion, setting: { mode: string; value: unknown } | null | undefined): string {
	if (!setting) return 'Not set';
	const target = describeTarget(name, setting.value);
	return setting.mode === 'not_used' ? `Ignored (${target})` : `${target} · ${MODE_LABELS[setting.mode as CriterionMode]}`;
}

export function journeySettings(answers: PurposeAnswers, g: Guidance): JourneySettings {
	const need = byId(g.needs, answers.need);
	const coverage = byId(g.regions, answers.region)?.coverage ?? null;
	const band = byId(g.details, answers.detail)?.resolution_m ?? null;
	const revisit = byId(g.frequencies, answers.frequency)?.revisit_days ?? null;
	return {
		family: (need && familyFor(need.families)) ?? ALL_FAMILIES,
		spatial_resolution_m: answers.resolution ?? (band !== null ? { mode: 'preferred', value: band } : null),
		revisit_days: answers.revisit ?? (revisit !== null ? { mode: 'preferred', value: revisit } : null),
		geographic_coverage: coverage ? { mode: 'preferred', value: coverage } : null
	};
}

export function currentJourneySettings(state: ExplorerState): JourneySettings {
	const pick = (name: 'spatial_resolution_m' | 'revisit_days') => {
		const setting = state.criteria[name];
		return setting ? { mode: setting.mode, value: Number(setting.value) } : null;
	};
	const coverage = state.criteria.geographic_coverage;
	return {
		family: state.family,
		spatial_resolution_m: pick('spatial_resolution_m'),
		revisit_days: pick('revisit_days'),
		geographic_coverage: coverage ? { mode: coverage.mode, value: String(coverage.value) } : null
	};
}

export function sameSettings(a: JourneySettings, b: JourneySettings): boolean {
	const same = (x: { mode: string; value: unknown } | null | undefined, y: { mode: string; value: unknown } | null | undefined) => (!x && !y) || (Boolean(x) && Boolean(y) && x!.mode === y!.mode && x!.value === y!.value);
	return a.family === b.family && same(a.spatial_resolution_m, b.spatial_resolution_m) && same(a.revisit_days, b.revisit_days) && same(a.geographic_coverage, b.geographic_coverage);
}

function settingReason(name: JourneyCriterion, answers: PurposeAnswers, g: Guidance, setting: { mode: string } | null): string {
	if (!setting) {
		if (name === 'geographic_coverage') return answers.region ? 'A specific site works with any reported coverage.' : 'Not asked yet: answer “Where?” to order by coverage.';
		if (name === 'spatial_resolution_m') return answers.detail === 'unsure' ? 'Not sure yet, so no preference.' : 'Not asked yet: answer “Smallest thing” to order by detail.';
		return answers.frequency ? 'This answer adds a check on usable observations instead of a number.' : 'Not asked yet: answer “How often” to order by revisit.';
	}
	if (name === 'spatial_resolution_m' && answers.resolution) return 'You entered this value.';
	if (name === 'revisit_days' && answers.revisit) return 'You entered this value.';
	const label = name === 'geographic_coverage' ? byId(g.regions, answers.region)?.label : name === 'spatial_resolution_m' ? byId(g.details, answers.detail)?.label : byId(g.frequencies, answers.frequency)?.label;
	return `From “${label}”. Preferred orders results and never hides a product.`;
}

export function proposePurpose(answers: PurposeAnswers, g: Guidance, state: ExplorerState): PurposeProposal {
	const settings = journeySettings(answers, g);
	const need = byId(g.needs, answers.need) ?? null;
	const proposed: ProposedSetting[] = [];
	proposed.push({
		label: 'Measurement family',
		value: familyLabel(settings.family),
		mode: settings.family === ALL_FAMILIES ? '—' : 'Filter',
		reason: need ? need.explanation : 'Choose what you need to see to propose a measurement family.'
	});
	for (const name of JOURNEY_CRITERIA) {
		const setting = settings[name];
		proposed.push({
			label: CRITERION_BY_NAME[name].label,
			value: setting ? describeTarget(name, setting.value) : 'Not set',
			mode: setting ? MODE_LABELS[setting.mode] : 'Ignore',
			reason: settingReason(name, answers, g, setting)
		});
	}

	const changes: ProfileChange[] = [];
	if (state.family !== settings.family) changes.push({ label: 'Measurement family', from: familyLabel(state.family), to: familyLabel(settings.family) });
	for (const name of JOURNEY_CRITERIA) {
		const before = describeCriterionSetting(name, state.criteria[name]);
		const after = describeCriterionSetting(name, settings[name]);
		if (before !== after) changes.push({ label: CRITERION_BY_NAME[name].label, from: before, to: after });
	}

	const retained: string[] = [];
	if (state.search.trim()) retained.push(`Search “${state.search.trim()}”`);
	if (state.scope !== 'CEOS-ARD assessed only') retained.push(`Catalogue scope: ${state.scope}`);
	else retained.push('Catalogue scope: CEOS-ARD assessed products');
	const bitDepth = state.criteria.radiometric_bit_depth;
	if (bitDepth) retained.push(`${CRITERION_BY_NAME.radiometric_bit_depth.label} ${describeTarget('radiometric_bit_depth', bitDepth.value)} · ${MODE_LABELS[bitDepth.mode]}`);
	if (state.providers.length) retained.push(`Providers: ${state.providers.join(', ')}`);
	if (state.sensor.trim()) retained.push(`Sensor contains “${state.sensor.trim()}”`);
	if (state.operational.length) retained.push(`Operational status: ${state.operational.join(', ')}`);
	if (state.sources.length) retained.push(`Record sources: ${state.sources.join(', ')}`);
	if (state.hideUnknown) retained.push('Hiding records with unreported values');
	if (state.includeMim) retained.push('MIM records included when loaded');
	if (state.shortlist.length) retained.push(`Shortlist (${state.shortlist.length}), comparison and notes`);

	const next = cloneState(state);
	next.family = settings.family;
	for (const name of JOURNEY_CRITERIA) {
		const setting = settings[name];
		if (setting) next.criteria[name] = { mode: setting.mode, value: setting.value };
		else delete next.criteria[name];
	}
	next.purpose = purposeKey(answers);
	next.guidanceVersion = next.purpose ? g.version : null;
	next.profileId = null;

	const preferences = JOURNEY_CRITERIA.filter((name) => settings[name]?.mode === 'preferred').length;
	return { settings, proposed, changes, retained, notes: qualitativeNotes(answers), need, preferences, next };
}

// ------------------------------------------------------------------ next actions for a product

export interface NextAction {
	label: string;
	url: string;
	internal?: boolean;
}

export function checkActions(check: GuidanceCheck, product: Product | null, g: Guidance, detailHref?: string): NextAction[] {
	const actions: NextAction[] = [];
	for (const kind of check.next) {
		if (kind.startsWith('external:')) {
			const source = g.sources.find((s) => s.id === kind.slice(9));
			if (source) actions.push({ label: `Guidance: ${source.short}`, url: source.url });
			continue;
		}
		if (!product) continue;
		if (kind === 'access') {
			const action = accessAction(product);
			if (action.url) actions.push({ label: action.fallback ? 'Documentation (no access link recorded)' : 'Check acquisitions in the provider portal', url: action.url });
		} else if (kind === 'documentation') {
			const url = safeUrl(product.information_url);
			if (url) actions.push({ label: 'Product documentation', url });
		} else if (kind === 'assessment') {
			const peer = safeUrl(product.peer_review_url);
			const self = safeUrl(product.self_assessment_url);
			if (peer) actions.push({ label: 'CEOS peer-review outcome', url: peer });
			if (self) actions.push({ label: 'Self-assessment', url: self });
		} else if (kind === 'quality' && detailHref) {
			actions.push({ label: 'Measured quality evidence', url: `${detailHref}#quality-heading`, internal: true });
		}
	}
	const seen = new Set<string>();
	return actions.filter((action) => (seen.has(action.url) ? false : (seen.add(action.url), true)));
}

// ------------------------------------------------------------------ user check outcomes (private, session)

export type CheckOutcome = 'open' | 'supports' | 'concern' | 'not-applicable';
export const CHECK_OUTCOME_LABELS: Record<CheckOutcome, string> = {
	open: 'Open',
	supports: 'Checked — supports my use',
	concern: 'Checked — concern',
	'not-applicable': 'Not applicable to my use'
};
