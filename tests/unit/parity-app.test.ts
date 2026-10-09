import { describe, expect, it } from 'vitest';
import { BIT_DEPTH_PRESETS, COVERAGE_LEVELS, NO_COVERAGE_REQUIREMENT, nearestPreset, REVISIT_PRESETS, SPATIAL_PRESETS } from '../../src/lib/domain/criteria';
import { metadataFilter, type MetadataFilterState } from '../../src/lib/domain/filters';
import { legacyBuildActiveProfile, legacyFiltersChanged, normaliseProfileName, PRODUCT_FAMILIES, profileNameError } from '../../src/lib/domain/profiles';
import type { Product, Profile } from '../../src/lib/domain/types';
import { parity } from './fixtures';

const fixture = parity('app_cases.json');
const matching = parity('matching_cases.json');
const profiles: Profile[] = parity('profiles_normalised.json');
const products: Product[] = [...parity('catalogue_normalised.json'), ...matching.synthetic_products, ...fixture.extra_products];

function legacyState(session: any, family: string): MetadataFilterState {
	return {
		family,
		search: session.advanced_search,
		ceosFilter: session.ceos_filter,
		providers: session.provider_filter,
		sensor: session.sensor_filter,
		operationalStatuses: session.operational_filter,
		sources: session.source_filter,
		showUnknown: session.show_unknown,
		active: { spatial: session.use_spatial, revisit: session.use_revisit, bitDepth: session.use_bit_depth, coverage: session.coverage_filter !== 'No requirement' },
		legacyLaunchYear: session.launch_year_filter
	};
}

describe('app helper parity with legacy Python', () => {
	it('keeps prototype constants', () => {
		expect(PRODUCT_FAMILIES).toEqual(fixture.constants.PRODUCT_FAMILIES);
		expect(SPATIAL_PRESETS).toEqual(fixture.constants.SPATIAL_SLIDER_OPTIONS);
		expect(REVISIT_PRESETS).toEqual(fixture.constants.REVISIT_SLIDER_OPTIONS);
		expect(BIT_DEPTH_PRESETS).toEqual(fixture.constants.BIT_DEPTH_SLIDER_OPTIONS);
		expect([NO_COVERAGE_REQUIREMENT, ...COVERAGE_LEVELS]).toEqual(fixture.constants.COVERAGE_OPTIONS);
	});

	for (const scenario of fixture.filters) {
		it(`metadata filter "${scenario.name}" keeps the same records in the same order`, () => {
			expect(metadataFilter(products, legacyState(scenario.state, scenario.family)).map((p) => p.id)).toEqual(scenario.ids);
		});
	}

	it('builds the active profile like build_active_profile', () => {
		for (const testCase of fixture.active_profiles) {
			const profile = profiles.find((p) => p.id === testCase.profile_id)!;
			expect(legacyBuildActiveProfile(profile, testCase.session)).toEqual(testCase.active);
		}
	});

	it('validates profile names like custom_profile_name_error', () => {
		const existing = [...profiles, { id: 'custom-1', name: 'Straße' }];
		for (const testCase of fixture.profile_names) {
			const clean = normaliseProfileName(testCase.raw);
			expect(clean).toBe(testCase.clean);
			expect(profileNameError(clean, existing, testCase.exclude)).toBe(testCase.error);
		}
	});

	it('detects changed filters like filters_changed (legacy, including its coverage omission)', () => {
		for (const testCase of fixture.filters_changed) {
			const profile = profiles.find((p) => p.id === testCase.profile_id)!;
			expect([testCase.label, legacyFiltersChanged(profile, testCase.state)]).toEqual([testCase.label, testCase.changed]);
		}
	});

	it('chooses the nearest slider preset like nearest_slider_value', () => {
		const options: Record<string, number[]> = { SPATIAL_SLIDER_OPTIONS: SPATIAL_PRESETS, REVISIT_SLIDER_OPTIONS: REVISIT_PRESETS, BIT_DEPTH_SLIDER_OPTIONS: BIT_DEPTH_PRESETS };
		for (const testCase of fixture.nearest_slider) expect(nearestPreset(testCase.value, options[testCase.options]!)).toBe(testCase.nearest);
	});
});
