/**
 * Presentation layer over the unchanged core grouping. It never re-scores or re-orders
 * records: sections are views onto the core groups in their original relative order.
 */
import { activeCriteria, CRITERION_BY_NAME, describeTarget, formatNumber } from './criteria';
import { GROUP_ELIGIBLE, GROUP_NEAR, GROUP_STRONG, type GroupedResults } from './matching';
import type { CriterionName, Criteria, MatchResult, Product } from './types';

export type ReasonState = 'met' | 'outside' | 'unknown';

export interface CriterionReason {
	name: CriterionName;
	label: string;
	mode: 'required' | 'preferred';
	state: ReasonState;
	target: string;
	reported: string | null;
	text: string;
}

export interface PresentedResult {
	result: MatchResult;
	reasons: CriterionReason[];
	requiredOutside: CriterionReason[];
	requiredUnknown: CriterionReason[];
	/** One short line for summaries. */
	headline: string;
}

export type SectionKey = 'browse' | 'preference-order' | 'meet-required' | 'outside-required' | 'needs-evidence';

export interface ResultSection {
	key: SectionKey;
	title: string;
	description: string;
	items: PresentedResult[];
	/** Manual-check sections start collapsed but always show their count. */
	collapsible: boolean;
}

export interface PresentedResults {
	mode: 'browse' | 'preferences' | 'requirements';
	sections: ResultSection[];
	counts: { total: number; meetRequired: number; outsideRequired: number; needsEvidence: number; manualCheck: number };
	orderingNote: string | null;
}

function reportedValue(product: Product, name: CriterionName): string | null {
	switch (name) {
		case 'spatial_resolution_m':
			return product.spatial_resolution_m === null ? null : `${formatNumber(product.spatial_resolution_m)} m`;
		case 'revisit_days':
			return product.revisit_days === null ? null : `${formatNumber(product.revisit_days)} days`;
		case 'radiometric_bit_depth':
			return product.radiometric_bit_depth === null ? null : `${product.radiometric_bit_depth} bit`;
		case 'geographic_coverage':
			return product.geographic_coverage === 'Unknown' ? null : product.geographic_coverage;
	}
}

export function criterionReasons(result: MatchResult, criteria: Criteria): CriterionReason[] {
	const reasons: CriterionReason[] = [];
	for (const [name, setting] of activeCriteria(criteria)) {
		const state = result.states[name];
		if (state !== 'met' && state !== 'outside' && state !== 'unknown') continue;
		const definition = CRITERION_BY_NAME[name];
		const mode = setting.mode as 'required' | 'preferred';
		const target = describeTarget(name, setting.value);
		const reported = reportedValue(result.product, name);
		const prefix = `${definition.label} ${target} (${mode === 'required' ? 'Required' : 'Preferred'})`;
		const text =
			state === 'met'
				? `${prefix}: reported ${reported} — reported value meets your criterion`
				: state === 'outside'
					? `${prefix}: reported ${reported} — outside your ${mode === 'required' ? 'requirement' : 'preference'}`
					: `${prefix}: not reported — evidence needed (manual check)`;
		reasons.push({ name, label: definition.label, mode, state, target, reported, text });
	}
	return reasons;
}

function headline(reasons: CriterionReason[]): string {
	if (!reasons.length) return 'No screening criteria are active.';
	const requiredOutside = reasons.filter((r) => r.mode === 'required' && r.state === 'outside');
	const requiredUnknown = reasons.filter((r) => r.mode === 'required' && r.state === 'unknown');
	const preferred = reasons.filter((r) => r.mode === 'preferred');
	const parts: string[] = [];
	if (requiredOutside.length) parts.push(`Outside your requirement: ${requiredOutside.map((r) => r.label.toLowerCase()).join(', ')}`);
	if (requiredUnknown.length) parts.push(`Evidence needed: ${requiredUnknown.map((r) => r.label.toLowerCase()).join(', ')}`);
	if (!requiredOutside.length && !requiredUnknown.length && reasons.some((r) => r.mode === 'required')) parts.push('Reported values meet your required criteria');
	if (preferred.length) {
		const met = preferred.filter((r) => r.state === 'met').length;
		const unknown = preferred.filter((r) => r.state === 'unknown').length;
		parts.push(`${met} of ${preferred.length} preferences met${unknown ? ` (${unknown} not reported)` : ''}`);
	}
	return parts.join(' · ');
}

export function presentResult(result: MatchResult, criteria: Criteria): PresentedResult {
	const reasons = criterionReasons(result, criteria);
	return {
		result,
		reasons,
		requiredOutside: reasons.filter((r) => r.mode === 'required' && r.state === 'outside'),
		requiredUnknown: reasons.filter((r) => r.mode === 'required' && r.state === 'unknown'),
		headline: headline(reasons)
	};
}

export const PREFERENCE_ORDER_NOTE =
	'Ordered by the number of preferences met, then by fewer unreported values, then by name. This order is not a quality or suitability ranking.';

export function presentResults(grouped: GroupedResults, criteria: Criteria): PresentedResults {
	const strong = grouped[GROUP_STRONG] ?? [];
	const eligible = grouped[GROUP_ELIGIBLE] ?? [];
	const near = grouped[GROUP_NEAR] ?? [];
	const active = activeCriteria(criteria);
	const anyRequired = active.some(([, setting]) => setting.mode === 'required');
	const anyPreferred = active.some(([, setting]) => setting.mode === 'preferred');
	const present = (items: MatchResult[]) => items.map((item) => presentResult(item, criteria));
	const meeting = present([...strong, ...eligible]);
	const nearPresented = present(near);
	// A record with any reported required mismatch is listed once, under "outside", and also shows missing-evidence reasons.
	const outside = nearPresented.filter((item) => item.requiredOutside.length > 0);
	const evidence = nearPresented.filter((item) => item.requiredOutside.length === 0);
	const counts = {
		total: meeting.length + nearPresented.length,
		meetRequired: meeting.length,
		outsideRequired: outside.length,
		needsEvidence: evidence.length,
		manualCheck: nearPresented.length
	};

	if (!active.length) {
		return {
			mode: 'browse',
			sections: [{ key: 'browse', title: 'Browse products', description: 'No screening criteria are active. Products are listed by name.', items: [...meeting, ...nearPresented], collapsible: false }],
			counts,
			orderingNote: null
		};
	}
	if (!anyRequired) {
		return {
			mode: 'preferences',
			sections: [{ key: 'preference-order', title: 'Products ordered by your preferences', description: PREFERENCE_ORDER_NOTE, items: [...meeting, ...nearPresented], collapsible: false }],
			counts,
			orderingNote: PREFERENCE_ORDER_NOTE
		};
	}
	return {
		mode: 'requirements',
		sections: [
			{
				key: 'meet-required',
				title: 'Meet your required criteria',
				description: anyPreferred
					? 'Reported values meet every Required criterion. Preferences determine the order; this is not a quality ranking.'
					: 'Reported values meet every Required criterion. Listed by name.',
				items: meeting,
				collapsible: false
			},
			{
				key: 'outside-required',
				title: 'Reported outside a requirement',
				description: 'A reported value is outside at least one Required criterion. Any missing evidence is also listed. Check whether the requirement is essential for your task.',
				items: outside,
				collapsible: true
			},
			{
				key: 'needs-evidence',
				title: 'Need evidence for a requirement',
				description: 'At least one Required value is not reported. Missing evidence is not a mismatch; check the provider documentation.',
				items: evidence,
				collapsible: true
			}
		],
		counts,
		orderingNote: anyPreferred ? PREFERENCE_ORDER_NOTE : null
	};
}
