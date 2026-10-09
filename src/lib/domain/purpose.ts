/**
 * Purpose-led entry: typed, versioned guidance and the explicit answer-to-settings mapping.
 *
 * Mapping version 1 rules (documented in docs/purpose-journey/GUIDANCE.md):
 * - A single chosen measurement sets the measurement-family filter; every other answer
 *   (including "Help me decide" and "optical and radar") leaves all families.
 * - Qualitative answers ("small features", "seasonally", …) never become numeric criteria.
 *   They produce explanations and manual checks.
 * - Numeric criteria come only from values the user typed, with the mode the user chose.
 * Pure: no UI, storage or network.
 */
import { CRITERION_BY_NAME, describeTarget, MODE_LABELS } from './criteria';
import { cloneState, type ExplorerState } from './explorer';
import { accessAction, safeUrl } from './facts';
import { ALL_FAMILIES } from './filters';
import { familyLabel } from './guidance';
import type { ProfileChange } from './profiles';
import type { CriterionMode, Product } from './types';

// ------------------------------------------------------------------ guidance model

export type GuidanceStatus = 'illustrative' | 'general' | 'reviewed';
export type NextActionKind = 'access' | 'documentation' | 'assessment' | 'quality' | `external:${string}`;

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
}
export interface GoalOption extends Option {
	kind: 'change' | 'mapping' | 'explore' | 'custom';
}
export interface ContextOption extends Option {
	phrase: string;
}
export interface QuestionOption extends Option {
	goals: string[] | null;
	contexts: string[] | null;
	default_output: string;
}
export interface MeasurementOption extends Option {
	family: string | null;
	visual: VisualFamily;
	explanation: string;
}
export interface DetailOption extends Option {
	visual: VisualDetail;
}
export interface GuidanceCheck {
	id: string;
	label: string;
	why: string;
	next: NextActionKind[];
	sources: string[];
	when?: { goals?: string[]; measurements?: string[] };
}
export interface GuidanceEntry {
	id: string;
	status: GuidanceStatus;
	summary?: string;
	applies: { goals: string[] | null; contexts: string[] | null; questions: string[] | null };
	assumptions: string[];
	checks: GuidanceCheck[];
	measurement_notes: Record<string, string>;
	output_notes: Record<string, string>;
}
export interface Guidance {
	schema: 1;
	version: string;
	mapping_version: number;
	status: GuidanceStatus;
	review: { reviewed: boolean; note: string };
	updated: string;
	sources: GuidanceSource[];
	goals: GoalOption[];
	contexts: ContextOption[];
	questions: QuestionOption[];
	outputs: Option[];
	measurements: MeasurementOption[];
	details: DetailOption[];
	frequencies: Option[];
	guidance: GuidanceEntry[];
}

export class GuidanceError extends Error {}

/** Structural validation of the version-controlled guidance file. */
export function loadGuidance(raw: unknown): Guidance {
	if (!raw || typeof raw !== 'object') throw new GuidanceError('Guidance file is not an object.');
	const g = raw as Guidance;
	if (g.schema !== 1) throw new GuidanceError('Unsupported guidance schema.');
	if (typeof g.version !== 'string' || !g.version) throw new GuidanceError('Guidance version is missing.');
	for (const key of ['sources', 'goals', 'contexts', 'questions', 'outputs', 'measurements', 'details', 'frequencies', 'guidance'] as const) {
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
	const sourceIds = new Set(g.sources.map((s) => s.id));
	const families = new Set(['Surface Reflectance', 'Surface Temperature', 'Synthetic Aperture Radar', 'Aquatic Reflectance', 'Night-time Lights']);
	for (const m of g.measurements) if (m.family !== null && !families.has(m.family)) throw new GuidanceError(`Unknown family ${m.family}.`);
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

// ------------------------------------------------------------------ answers

export interface UserCriterion {
	mode: CriterionMode;
	value: number;
}

export interface PurposeAnswers {
	goal: string | null;
	goalText: string;
	context: string | null;
	contextText: string;
	question: string | null;
	questionText: string;
	output: string | null;
	measurement: string | null;
	detail: string | null;
	frequency: string | null;
	/** Private context: never used for search, geocoding or availability, never put in URLs. */
	area: string;
	period: string;
	/** Optional technical settings the user typed. */
	resolution: UserCriterion | null;
	revisit: UserCriterion | null;
}

export const EMPTY_ANSWERS: PurposeAnswers = Object.freeze({
	goal: null,
	goalText: '',
	context: null,
	contextText: '',
	question: null,
	questionText: '',
	output: null,
	measurement: null,
	detail: null,
	frequency: null,
	area: '',
	period: '',
	resolution: null,
	revisit: null
}) as PurposeAnswers;

export const TEXT_MAX = 160;

const byId = <T extends { id: string }>(list: T[], id: string | null) => (id ? list.find((item) => item.id === id) : undefined);

export function questionsFor(g: Guidance, goal: string | null, context: string | null): QuestionOption[] {
	return g.questions.filter((q) => (!q.goals || (goal !== null && q.goals.includes(goal))) && (!q.contexts || (context !== null && q.contexts.includes(context))));
}

/** Answers are useful enough to propose settings: a purpose has been chosen or described. */
export function hasPurpose(answers: PurposeAnswers): boolean {
	return Boolean(answers.goal && (answers.goal !== 'custom' || answers.goalText.trim()));
}

/** Validate untrusted (session) answers against the guidance; unknown ids are dropped. */
export function sanitiseAnswers(raw: unknown, g: Guidance): PurposeAnswers {
	const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const id = (list: { id: string }[], v: unknown) => (typeof v === 'string' && list.some((item) => item.id === v) ? v : null);
	const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, TEXT_MAX) : '');
	const criterion = (v: unknown, name: 'spatial_resolution_m' | 'revisit_days'): UserCriterion | null => {
		if (!v || typeof v !== 'object') return null;
		const c = v as Record<string, unknown>;
		const definition = CRITERION_BY_NAME[name];
		const number = Number(c.value);
		if (definition.kind !== 'number' || !Number.isFinite(number) || number < definition.min || number > definition.max) return null;
		return c.mode === 'required' || c.mode === 'preferred' || c.mode === 'not_used' ? { mode: c.mode, value: number } : null;
	};
	const answers: PurposeAnswers = {
		goal: id(g.goals, value.goal),
		goalText: text(value.goalText),
		context: id(g.contexts, value.context),
		contextText: text(value.contextText),
		question: id(g.questions, value.question),
		questionText: text(value.questionText),
		output: id(g.outputs, value.output),
		measurement: id(g.measurements, value.measurement),
		detail: id(g.details, value.detail),
		frequency: id(g.frequencies, value.frequency),
		area: text(value.area),
		period: text(value.period),
		resolution: criterion(value.resolution, 'spatial_resolution_m'),
		revisit: criterion(value.revisit, 'revisit_days')
	};
	if (answers.question && !questionsFor(g, answers.goal, answers.context).some((q) => q.id === answers.question)) answers.question = null;
	return answers;
}

// ------------------------------------------------------------------ public key (URL)

/** Public, non-private purpose key built only from fixed ids: `goal~context~question`. */
export function purposeKey(answers: PurposeAnswers): string | null {
	if (!answers.goal) return null;
	return [answers.goal, answers.context ?? '-', answers.question ?? '-'].join('~');
}

export interface ParsedKey {
	goal: string;
	context: string | null;
	question: string | null;
}

export function parsePurposeKey(key: string | null, g: Guidance): ParsedKey | null {
	if (!key) return null;
	const [goal, context, question] = key.split('~');
	if (!byId(g.goals, goal ?? null)) return null;
	if (context && context !== '-' && !byId(g.contexts, context)) return null;
	if (question && question !== '-' && !byId(g.questions, question)) return null;
	return { goal: goal!, context: context && context !== '-' ? context : null, question: question && question !== '-' ? question : null };
}

export function answersFromKey(parsed: ParsedKey): PurposeAnswers {
	return { ...structuredClone(EMPTY_ANSWERS), goal: parsed.goal, context: parsed.context, question: parsed.question };
}

// ------------------------------------------------------------------ wording

/**
 * One readable sentence. Private text (custom purpose, place) is included only when
 * `includePrivate` is set — never in shared or URL-derived wording.
 */
export function purposeSentence(answers: PurposeAnswers, g: Guidance, { includePrivate = true } = {}): string {
	const goal = byId(g.goals, answers.goal);
	if (!goal) return 'No purpose described yet.';
	const goalText = goal.id === 'custom' ? (includePrivate && answers.goalText.trim() ? answers.goalText.trim() : 'do something else') : goal.label;
	const context = byId(g.contexts, answers.context);
	let contextText = '';
	if (context) {
		contextText = context.id === 'custom' ? (includePrivate && answers.contextText.trim() ? ` in ${answers.contextText.trim()}` : ' in another setting') : ` ${context.phrase}`;
	}
	const question = byId(g.questions, answers.question);
	let questionText = '';
	if (question && question.id !== 'unsure') {
		questionText = question.id === 'custom' ? (includePrivate && answers.questionText.trim() ? `, to understand ${answers.questionText.trim()}` : '') : `, to understand ${question.label}`;
	}
	return `I want to ${goalText}${contextText}${questionText}.`;
}

export function outputLabel(answers: PurposeAnswers, g: Guidance): string | null {
	const output = byId(g.outputs, answers.output ?? defaultOutput(answers, g));
	return output && output.id !== 'unsure' ? output.label : null;
}

export function defaultOutput(answers: PurposeAnswers, g: Guidance): string | null {
	return byId(g.questions, answers.question)?.default_output ?? null;
}

// ------------------------------------------------------------------ imagery state

export type VisualFamily = 'optical' | 'radar' | 'thermal' | 'neutral';
export type VisualDetail = 'fine' | 'coarse';

/** Decorative background state. Never an input to filtering. */
export function visualState(answers: PurposeAnswers, g: Guidance): { family: VisualFamily; detail: VisualDetail } {
	const family = byId(g.measurements, answers.measurement)?.visual ?? 'neutral';
	const detail = byId(g.details, answers.detail)?.visual ?? 'fine';
	return { family, detail };
}

// ------------------------------------------------------------------ guidance resolution

export function matchingGuidance(g: Guidance, answers: Pick<PurposeAnswers, 'goal' | 'context' | 'question'>): GuidanceEntry[] {
	const applies = (list: string[] | null, value: string | null) => !list || (value !== null && list.includes(value));
	return g.guidance.filter((entry) => applies(entry.applies.goals, answers.goal) && applies(entry.applies.contexts, answers.context) && applies(entry.applies.questions, answers.question));
}

export interface ResolvedCheck extends GuidanceCheck {
	guidanceId: string;
	status: GuidanceStatus;
}

export function resolveChecks(g: Guidance, answers: PurposeAnswers): ResolvedCheck[] {
	const checks: ResolvedCheck[] = [];
	const seen = new Set<string>();
	const measurement = answers.measurement ?? 'decide';
	for (const entry of matchingGuidance(g, answers)) {
		for (const check of entry.checks) {
			if (seen.has(check.id)) continue;
			if (check.when?.goals && !(answers.goal && check.when.goals.includes(answers.goal))) continue;
			if (check.when?.measurements && !check.when.measurements.includes(measurement)) continue;
			seen.add(check.id);
			checks.push({ ...check, guidanceId: entry.id, status: entry.status });
		}
	}
	return checks;
}

/** The most specific guidance status that applies (illustrative beats general). */
export function guidanceStatus(g: Guidance, answers: PurposeAnswers): { status: GuidanceStatus | 'user'; label: string } {
	const entries = matchingGuidance(g, answers);
	if (entries.some((entry) => entry.status === 'illustrative')) {
		return { status: 'illustrative', label: `Illustrative guidance v${g.version} — not reviewed by CEOS or domain experts` };
	}
	if (answers.goal === 'custom' || answers.context === 'custom' || answers.question === 'custom') {
		return { status: 'user', label: `Your own purpose, with general checks v${g.version}` };
	}
	return { status: 'general', label: `General checks v${g.version} — no purpose-specific guidance yet` };
}

/** Guidance note about a measurement family for this purpose (or the user's chosen option). */
export function measurementNote(g: Guidance, answers: PurposeAnswers, key: string | null): string | null {
	if (!key) return null;
	for (const entry of matchingGuidance(g, answers).reverse()) if (entry.measurement_notes[key]) return entry.measurement_notes[key]!;
	return null;
}

const FAMILY_TO_MEASUREMENT: Record<string, string> = {
	'Surface Reflectance': 'sr',
	'Synthetic Aperture Radar': 'sar',
	'Surface Temperature': 'st'
};

export function productMeasurementNote(g: Guidance, answers: PurposeAnswers, product: Product): string | null {
	const key = product.product_family ? FAMILY_TO_MEASUREMENT[product.product_family] : undefined;
	return key ? measurementNote(g, answers, key) : null;
}

export function outputNote(g: Guidance, answers: PurposeAnswers): string | null {
	const output = answers.output ?? defaultOutput(answers, g);
	if (!output) return null;
	for (const entry of matchingGuidance(g, answers).reverse()) if (entry.output_notes[output]) return entry.output_notes[output]!;
	return null;
}

export function assumptions(g: Guidance, answers: PurposeAnswers): string[] {
	return [...new Set(matchingGuidance(g, answers).flatMap((entry) => entry.assumptions))];
}

export function sourcesFor(g: Guidance, ids: string[]): GuidanceSource[] {
	return ids.map((id) => g.sources.find((source) => source.id === id)).filter((source): source is GuidanceSource => Boolean(source));
}

// ------------------------------------------------------------------ explanations for qualitative answers

const DETAIL_EXPLANATIONS: Record<string, string> = {
	small: 'You need to distinguish small features. No resolution limit is set automatically: pixel spacing is not the size of the smallest feature you can detect, and it is not positional accuracy. Enter a limit below if your method needs one; otherwise compare each product’s resolution with your smallest feature.',
	broad: 'You are interested in broad patterns, which may tolerate coarser products. No limit is set automatically.',
	decide: 'Spatial detail depends on the size of what you need to see. No limit is set; compare product resolution with your smallest feature in the details.'
};
const FREQUENCY_EXPLANATIONS: Record<string, string> = {
	frequent: 'You need frequent observations. No revisit limit is set automatically: nominal revisit is an observation opportunity, not a count of usable, cloud-free observations or a delivery frequency.',
	seasonal: 'You need observations across each season. No revisit limit is set automatically; check that usable observations exist in each season you need.',
	years: 'You need a multi-year record. Record periods are not established in this catalogue; check each provider archive. Nominal revisit and mission age do not prove continuity.',
	unsure: 'How often you need observations is not decided yet; no revisit limit is set.'
};

export function qualitativeNotes(answers: PurposeAnswers): string[] {
	const notes: string[] = [];
	if (answers.detail && DETAIL_EXPLANATIONS[answers.detail]) notes.push(DETAIL_EXPLANATIONS[answers.detail]!);
	if (answers.frequency && FREQUENCY_EXPLANATIONS[answers.frequency]) notes.push(FREQUENCY_EXPLANATIONS[answers.frequency]!);
	if (answers.area.trim() || answers.period.trim()) {
		notes.push('Your area and period are kept as context for your record. The explorer does not search, map or check acquisitions for them.');
	}
	return notes;
}

// ------------------------------------------------------------------ proposal (mapping v1)

/** The settings the journey manages. Everything else in the explorer state is retained. */
export interface JourneySettings {
	family: string;
	spatial_resolution_m: UserCriterion | null;
	revisit_days: UserCriterion | null;
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
	measurement: MeasurementOption | null;
	next: ExplorerState;
}

function describeCriterionSetting(name: 'spatial_resolution_m' | 'revisit_days', setting: { mode: string; value: unknown } | null | undefined): string {
	if (!setting) return 'Not set';
	const target = describeTarget(name, setting.value);
	return setting.mode === 'not_used' ? `Ignored (${target})` : `${target} · ${MODE_LABELS[setting.mode as CriterionMode]}`;
}

export function journeySettings(answers: PurposeAnswers, g: Guidance): JourneySettings {
	const measurement = byId(g.measurements, answers.measurement);
	return {
		family: measurement?.family ?? ALL_FAMILIES,
		spatial_resolution_m: answers.resolution,
		revisit_days: answers.revisit
	};
}

export function currentJourneySettings(state: ExplorerState): JourneySettings {
	const pick = (name: 'spatial_resolution_m' | 'revisit_days') => {
		const setting = state.criteria[name];
		return setting ? { mode: setting.mode, value: Number(setting.value) } : null;
	};
	return { family: state.family, spatial_resolution_m: pick('spatial_resolution_m'), revisit_days: pick('revisit_days') };
}

export function sameSettings(a: JourneySettings, b: JourneySettings): boolean {
	const same = (x: UserCriterion | null, y: UserCriterion | null) => (x === null && y === null) || (x !== null && y !== null && x.mode === y.mode && x.value === y.value);
	return a.family === b.family && same(a.spatial_resolution_m, b.spatial_resolution_m) && same(a.revisit_days, b.revisit_days);
}

export function proposePurpose(answers: PurposeAnswers, g: Guidance, state: ExplorerState): PurposeProposal {
	const settings = journeySettings(answers, g);
	const measurement = byId(g.measurements, answers.measurement) ?? null;
	const proposed: ProposedSetting[] = [];
	proposed.push({
		label: 'Measurement family',
		value: familyLabel(settings.family),
		mode: settings.family === ALL_FAMILIES ? '—' : 'Filter',
		reason: measurement?.family
			? `You chose ${measurement.label}.`
			: measurement
				? `${measurement.explanation}`
				: 'No measurement chosen, so all families stay in the results.'
	});
	for (const [name, setting] of [['spatial_resolution_m', settings.spatial_resolution_m], ['revisit_days', settings.revisit_days]] as const) {
		const definition = CRITERION_BY_NAME[name];
		proposed.push({
			label: definition.label,
			value: setting ? describeTarget(name, setting.value) : 'Not set',
			mode: setting ? MODE_LABELS[setting.mode] : 'Ignore',
			reason: setting ? 'You entered this value.' : 'Not set: your answers describe needs that are not converted into a number automatically.'
		});
	}

	const changes: ProfileChange[] = [];
	if (state.family !== settings.family) changes.push({ label: 'Measurement family', from: familyLabel(state.family), to: familyLabel(settings.family) });
	for (const name of ['spatial_resolution_m', 'revisit_days'] as const) {
		const before = describeCriterionSetting(name, state.criteria[name]);
		const after = describeCriterionSetting(name, settings[name]);
		if (before !== after) changes.push({ label: CRITERION_BY_NAME[name].label, from: before, to: after });
	}

	const retained: string[] = [];
	if (state.search.trim()) retained.push(`Search “${state.search.trim()}”`);
	if (state.scope !== 'CEOS-ARD assessed only') retained.push(`Catalogue scope: ${state.scope}`);
	else retained.push('Catalogue scope: CEOS-ARD assessed products');
	for (const name of ['radiometric_bit_depth', 'geographic_coverage'] as const) {
		const setting = state.criteria[name];
		if (setting) retained.push(`${CRITERION_BY_NAME[name].label} ${describeTarget(name, setting.value)} · ${MODE_LABELS[setting.mode]}`);
	}
	if (state.providers.length) retained.push(`Providers: ${state.providers.join(', ')}`);
	if (state.sensor.trim()) retained.push(`Sensor contains “${state.sensor.trim()}”`);
	if (state.operational.length) retained.push(`Operational status: ${state.operational.join(', ')}`);
	if (state.sources.length) retained.push(`Record sources: ${state.sources.join(', ')}`);
	if (state.hideUnknown) retained.push('Hiding records with unreported values');
	if (state.includeMim) retained.push('MIM records included when loaded');
	if (state.shortlist.length) retained.push(`Shortlist (${state.shortlist.length}), comparison and notes`);

	const next = cloneState(state);
	next.family = settings.family;
	for (const name of ['spatial_resolution_m', 'revisit_days'] as const) {
		const setting = settings[name];
		if (setting) next.criteria[name] = { mode: setting.mode, value: setting.value };
		else delete next.criteria[name];
	}
	next.purpose = purposeKey(answers);
	next.guidanceVersion = next.purpose ? g.version : null;
	next.profileId = null;

	return { settings, proposed, changes, retained, notes: qualitativeNotes(answers), measurement, next };
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
