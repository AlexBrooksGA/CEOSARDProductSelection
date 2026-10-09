/**
 * The public explorer state (what a shareable link reproduces) and its mapping onto the
 * domain filter and matching inputs. Pure: no URL, storage or framework dependencies.
 */
import { CRITERIA, NO_COVERAGE_REQUIREMENT, isActiveMode } from './criteria';
import { ALL_FAMILIES, activeFromCriteria, type MetadataFilterState } from './filters';
import type { CeosFilter, Criteria, CriterionMode, CriterionName } from './types';

export interface ActiveSetting {
	mode: CriterionMode;
	value: number | string;
}

export interface ExplorerState {
	search: string;
	family: string;
	scope: CeosFilter;
	providers: string[];
	sensor: string;
	operational: string[];
	sources: string[];
	/** Hide records whose active-criterion values are unreported (prototype "keep unreported" unticked). */
	hideUnknown: boolean;
	/** Include MIM records in results once they have been deliberately loaded. */
	includeMim: boolean;
	/** Only the four known criteria; an absent key means "not set". */
	criteria: Partial<Record<CriterionName, ActiveSetting>>;
	shortlist: string[];
	compare: string[];
	/** Optional comparison field groups the user chose to show. */
	fields: string[];
	/** Built-in profile last applied (informational; criteria are authoritative). */
	profileId: string | null;
}

/** Neutral initial browse state: all families, assessed scope, no criteria, no launch-year cut-off. */
export const NEUTRAL_STATE: ExplorerState = Object.freeze({
	search: '',
	family: ALL_FAMILIES,
	scope: 'CEOS-ARD assessed only',
	providers: [],
	sensor: '',
	operational: [],
	sources: [],
	hideUnknown: false,
	includeMim: false,
	criteria: {},
	shortlist: [],
	compare: [],
	fields: [],
	profileId: null
}) as ExplorerState;

export function cloneState(state: ExplorerState): ExplorerState {
	return structuredClone({ ...state, criteria: { ...state.criteria } });
}

/** Criteria in canonical order for the matcher; coverage "No requirement" is not used. */
export function matchingCriteria(state: Pick<ExplorerState, 'criteria'>): Criteria {
	const criteria: Criteria = {};
	for (const definition of CRITERIA) {
		const setting = state.criteria[definition.name];
		if (!setting) {
			criteria[definition.name] = { mode: 'not_used', value: definition.defaultValue };
			continue;
		}
		const unusedCoverage = definition.kind === 'enum' && setting.value === NO_COVERAGE_REQUIREMENT;
		criteria[definition.name] = { mode: unusedCoverage ? 'not_used' : setting.mode, value: setting.value };
	}
	return criteria;
}

export function toFilterState(state: ExplorerState): MetadataFilterState {
	return {
		family: state.family,
		search: state.search,
		ceosFilter: state.scope,
		providers: state.providers,
		sensor: state.sensor,
		operationalStatuses: state.operational,
		sources: state.sources,
		showUnknown: !state.hideUnknown,
		active: activeFromCriteria(matchingCriteria(state))
	};
}

export function countActiveCriteria(state: ExplorerState): number {
	return Object.values(state.criteria).filter((setting) => setting && isActiveMode(setting.mode)).length;
}

/** Search, family and technical restrictions (not the catalogue/assessment scope). */
export function hasRefinements(state: ExplorerState): boolean {
	return Boolean(
		state.search.trim() ||
			state.family !== ALL_FAMILIES ||
			state.providers.length ||
			state.sensor.trim() ||
			state.operational.length ||
			state.sources.length ||
			state.hideUnknown ||
			Object.keys(state.criteria).length
	);
}

/** Clear criteria: removes search, family and technical restrictions; keeps scope, sources toggle and selections. */
export function clearCriteria(state: ExplorerState): ExplorerState {
	return {
		...cloneState(state),
		search: '',
		family: ALL_FAMILIES,
		providers: [],
		sensor: '',
		operational: [],
		sources: [],
		hideUnknown: false,
		criteria: {},
		profileId: null
	};
}
