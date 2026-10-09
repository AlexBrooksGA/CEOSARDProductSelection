/**
 * Screening-criterion definitions (labels, units, ranges, presets) shared by the URL
 * contract, the criterion editor and the explanations. Ranges and preset values are the
 * prototype's slider/number-input settings.
 */
import { formatG } from './text';
import type { CriterionMode, CriterionName, CriterionSetting, Criteria } from './types';

export const SPATIAL_PRESETS = [0.1, 0.2, 0.5, 1, 2.5, 5, 10, 15, 20, 25, 30, 50, 60, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
export const REVISIT_PRESETS = [0.1, 0.25, 0.5, 1, 2, 3, 4, 5, 7, 10, 12, 16, 20, 30, 45, 60, 90, 120, 180, 365];
export const BIT_DEPTH_PRESETS = Array.from({ length: 32 }, (_, index) => index + 1);
export const COVERAGE_LEVELS = ['Global', 'Continental or multi-country', 'National', 'Regional', 'Local or targeted'] as const;
export const NO_COVERAGE_REQUIREMENT = 'No requirement';

interface NumericDefinition {
	name: CriterionName;
	kind: 'number';
	label: string;
	shortLabel: string;
	unit: string;
	comparator: '≤' | '≥';
	min: number;
	max: number;
	step: number;
	integer: boolean;
	presets: number[];
	defaultValue: number;
	help: string;
	group: 'primary' | 'more';
}
interface EnumDefinition {
	name: CriterionName;
	kind: 'enum';
	label: string;
	shortLabel: string;
	unit: '';
	comparator: '≥';
	options: readonly string[];
	defaultValue: string;
	help: string;
	group: 'primary' | 'more';
}
export type CriterionDefinition = NumericDefinition | EnumDefinition;

export const CRITERIA: CriterionDefinition[] = [
	{
		name: 'spatial_resolution_m',
		kind: 'number',
		label: 'Spatial resolution',
		shortLabel: 'Resolution',
		unit: 'm',
		comparator: '≤',
		min: 0.1,
		max: 100_000,
		step: 0.1,
		integer: false,
		presets: SPATIAL_PRESETS,
		defaultValue: 30,
		help: 'Reported product spatial detail in metres. It is not positional (geometric) accuracy. Instrument resolution is never used for this criterion.',
		group: 'primary'
	},
	{
		name: 'revisit_days',
		kind: 'number',
		label: 'Nominal revisit',
		shortLabel: 'Revisit',
		unit: 'days',
		comparator: '≤',
		min: 0.1,
		max: 365,
		step: 0.1,
		integer: false,
		presets: REVISIT_PRESETS,
		defaultValue: 16,
		help: 'An expected observation opportunity for the mission or constellation. It is not guaranteed usable or cloud-free imagery, product update frequency, delivery time or latency.',
		group: 'primary'
	},
	{
		name: 'radiometric_bit_depth',
		kind: 'number',
		label: 'Radiometric bit depth',
		shortLabel: 'Bit depth',
		unit: 'bit',
		comparator: '≥',
		min: 1,
		max: 32,
		step: 1,
		integer: true,
		presets: BIT_DEPTH_PRESETS,
		defaultValue: 12,
		help: 'Reported number of radiometric quantisation levels. Output storage (for example 16-bit files) is not radiometric resolution, and bit depth alone does not determine radiometric quality.',
		group: 'more'
	},
	{
		name: 'geographic_coverage',
		kind: 'enum',
		label: 'Reported coverage',
		shortLabel: 'Coverage',
		unit: '',
		comparator: '≥',
		options: COVERAGE_LEVELS,
		defaultValue: 'Regional',
		help: 'A broad reported operating scope (Local → Global). It does not prove that observations exist for your area or period.',
		group: 'more'
	}
];

export const CRITERION_BY_NAME = Object.fromEntries(CRITERIA.map((definition) => [definition.name, definition])) as Record<CriterionName, CriterionDefinition>;

export const MODE_LABELS: Record<CriterionMode, string> = {
	required: 'Required',
	preferred: 'Preferred',
	not_used: 'Ignore'
};

export function isActiveMode(mode: unknown): mode is 'required' | 'preferred' {
	return mode === 'required' || mode === 'preferred';
}

/** Criteria whose mode is Required or Preferred (and coverage with a real level). */
export function activeCriteria(criteria: Criteria): [CriterionName, CriterionSetting][] {
	return CRITERIA.filter((definition) => {
		const setting = criteria[definition.name];
		if (!setting || !isActiveMode(setting.mode)) return false;
		return !(definition.kind === 'enum' && setting.value === NO_COVERAGE_REQUIREMENT);
	}).map((definition) => [definition.name, criteria[definition.name]!]);
}

export function hasActiveCriteria(criteria: Criteria): boolean {
	return activeCriteria(criteria).length > 0;
}

export function hasRequiredCriteria(criteria: Criteria): boolean {
	return activeCriteria(criteria).some(([, setting]) => setting.mode === 'required');
}

export function formatNumber(value: number): string {
	return formatG(value);
}

/** e.g. "≤ 30 m", "≥ 12 bit", "Regional or broader". */
export function describeTarget(name: CriterionName, value: unknown): string {
	const definition = CRITERION_BY_NAME[name];
	if (definition.kind === 'enum') return `${String(value)} or broader`;
	return `${definition.comparator} ${formatNumber(Number(value))} ${definition.unit}`;
}

export function describeCriterion(name: CriterionName, setting: CriterionSetting): string {
	const definition = CRITERION_BY_NAME[name];
	const mode = MODE_LABELS[(setting.mode as CriterionMode) ?? 'not_used'] ?? String(setting.mode);
	return `${definition.label} ${describeTarget(name, setting.value)} · ${mode}`;
}

/**
 * A complete four-criterion object for profiles and the matcher: every criterion present
 * (unset ones as Ignore with the default value), in the canonical order used by the
 * built-in profiles so summary wording order is stable.
 */
export function completeCriteria(criteria: Criteria): Criteria {
	const complete: Criteria = {};
	for (const definition of CRITERIA) {
		const setting = criteria[definition.name];
		complete[definition.name] = setting
			? { mode: setting.mode ?? 'not_used', value: setting.value ?? definition.defaultValue }
			: { mode: 'not_used', value: definition.defaultValue };
	}
	return complete;
}

/** Stable text fingerprint of the active criteria (used to flag stale rationale). */
export function criteriaFingerprint(criteria: Criteria): string {
	return activeCriteria(criteria)
		.map(([name, setting]) => `${name}=${setting.mode}:${String(setting.value)}`)
		.join('|');
}

export function clampCriterionValue(name: CriterionName, value: number): number {
	const definition = CRITERION_BY_NAME[name];
	if (definition.kind !== 'number') return value;
	const bounded = Math.min(definition.max, Math.max(definition.min, value));
	return definition.integer ? Math.round(bounded) : bounded;
}

export function nearestPreset(value: number, options: number[]): number {
	// Python min() returns the first minimum, so ties resolve to the smaller (earlier) option.
	let best = options[0]!;
	for (const option of options) {
		if (Math.abs(option - value) < Math.abs(best - value)) best = option;
	}
	return best;
}
