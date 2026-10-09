/**
 * Transparent, non-numeric criterion matching and result grouping.
 *
 * A line-for-line port of legacy `matching.py`. The group names, counts and ordering are
 * internal mechanics preserved for compatibility; they are not quality or suitability
 * scores. User-facing wording lives in `presentation.ts`.
 */
import { casefold, compareCodePoints } from './text';
import type { CriterionState, MatchResult, Product, Profile } from './types';

export const GROUP_STRONG = 'Closer profile matches';
export const GROUP_ELIGIBLE = 'Other products meeting required profile criteria';
export const GROUP_NEAR = 'Manual task check';
export const GROUP_ORDER = [GROUP_STRONG, GROUP_ELIGIBLE, GROUP_NEAR] as const;

export const COVERAGE_SCALE: Record<string, number> = {
	Unknown: -1,
	'Local or targeted': 0,
	Regional: 1,
	National: 2,
	'Continental or multi-country': 3,
	Global: 4
};

export const CRITERION_LABELS: Record<string, string> = {
	spatial_resolution_m: 'spatial resolution',
	revisit_days: 'nominal revisit',
	radiometric_bit_depth: 'radiometric bit depth',
	geographic_coverage: 'geographic coverage'
};

function criterionValue(product: Product, name: string): unknown {
	switch (name) {
		case 'spatial_resolution_m':
			return product.spatial_resolution_m;
		case 'revisit_days':
			return product.revisit_days;
		case 'radiometric_bit_depth':
			return product.radiometric_bit_depth;
		case 'geographic_coverage':
			return product.geographic_coverage;
		default:
			return null;
	}
}

/** Python `int()` for the numeric values used here (truncation toward zero). */
function pyInt(value: unknown): number {
	return Math.trunc(Number(value));
}

/** Evaluate one criterion without treating unavailable values as zero or pass. */
export function evaluateCriterion(product: Product, name: string, target: unknown): CriterionState {
	const actual = criterionValue(product, name);
	if (actual === null || actual === undefined || actual === 'Unknown') return 'unknown';
	if (name === 'spatial_resolution_m' || name === 'revisit_days') {
		return Number(actual) <= Number(target) ? 'met' : 'outside';
	}
	if (name === 'radiometric_bit_depth') {
		return pyInt(actual) >= pyInt(target) ? 'met' : 'outside';
	}
	if (name === 'geographic_coverage') {
		const required = COVERAGE_SCALE[String(target)] ?? -1;
		const reported = COVERAGE_SCALE[String(actual)] ?? -1;
		return required < 0 || reported >= required ? 'met' : 'outside';
	}
	return 'unknown';
}

/**
 * Evaluate required/preferred criteria and produce an auditable text summary.
 * Required unknowns cannot be assumed to pass. Optional unknowns do not reject a record,
 * but fully described records sort ahead of otherwise equivalent records.
 */
export function evaluateProduct(product: Product, profile: Pick<Profile, 'criteria'>): MatchResult {
	const states: Record<string, CriterionState> = {};
	let requiredOutside = false;
	let requiredUnknown = false;
	let preferredMet = 0;
	let unknownCount = 0;
	const metLabels: string[] = [];
	const outsideLabels: string[] = [];
	const unknownLabels: string[] = [];

	for (const [name, setting] of Object.entries(profile.criteria)) {
		// Python `setting.get("mode", "not_used")`: an explicit null mode is *not* treated as not_used.
		const mode = setting && 'mode' in setting ? setting.mode : 'not_used';
		if (mode === 'not_used') {
			states[name] = 'not_used';
			continue;
		}
		const state = evaluateCriterion(product, name, setting?.value);
		states[name] = state;
		const label = CRITERION_LABELS[name] ?? name.replaceAll('_', ' ');
		if (state === 'met') {
			metLabels.push(label);
			if (mode === 'preferred') preferredMet += 1;
		} else if (state === 'unknown') {
			unknownCount += 1;
			unknownLabels.push(label);
			if (mode === 'required') requiredUnknown = true;
		} else {
			outsideLabels.push(label);
			if (mode === 'required') requiredOutside = true;
		}
	}

	const group = requiredOutside || requiredUnknown ? GROUP_NEAR : GROUP_ELIGIBLE;
	const parts: string[] = [];
	if (metLabels.length) parts.push(`Reported characteristics match the selected ${metLabels.join(' and ')} criteria.`);
	if (outsideLabels.length) parts.push(`Reported characteristics are outside the selected ${outsideLabels.join(' and ')} criteria.`);
	if (unknownLabels.length) parts.push(`Manual task check — not reported: ${unknownLabels.join(', ')}.`);
	if (!parts.length) parts.push('No application-screening criteria are active.');
	return { product, group, states, preferred_met: preferredMet, unknown_count: unknownCount, summary: parts.join(' ') };
}

export type GroupedResults = Record<string, MatchResult[]>;

function sortResults(items: MatchResult[]): void {
	const keyed = items.map((item, index) => ({ item, index, name: casefold(item.product.product_name) }));
	keyed.sort((a, b) => {
		if (a.item.preferred_met !== b.item.preferred_met) return b.item.preferred_met - a.item.preferred_met;
		if (a.item.unknown_count !== b.item.unknown_count) return a.item.unknown_count - b.item.unknown_count;
		const byName = compareCodePoints(a.name, b.name);
		return byName !== 0 ? byName : a.index - b.index;
	});
	items.splice(0, items.length, ...keyed.map((entry) => entry.item));
}

/** Group records and sort by preferred criteria, completeness, then case-folded name. */
export function groupAndSort(products: Product[], profile: Pick<Profile, 'criteria'>): GroupedResults {
	const results = products.map((product) => evaluateProduct(product, profile));
	const eligible = results.filter((item) => item.group === GROUP_ELIGIBLE);
	const maxPreferred = eligible.reduce((max, item) => Math.max(max, item.preferred_met), -1);
	for (const item of eligible) {
		if (item.preferred_met === maxPreferred && item.unknown_count === 0) item.group = GROUP_STRONG;
	}
	const grouped: GroupedResults = { [GROUP_STRONG]: [], [GROUP_ELIGIBLE]: [], [GROUP_NEAR]: [] };
	for (const item of results) grouped[item.group]!.push(item);
	for (const items of Object.values(grouped)) sortResults(items);
	return grouped;
}

/** Add a unique comparison identifier without displacing existing choices. */
export function addComparison(selection: readonly string[], productId: string, maximum = 3): [string[], boolean] {
	if (selection.includes(productId)) return [[...selection], true];
	if (selection.length >= maximum) return [[...selection], false];
	return [[...selection, productId], true];
}
