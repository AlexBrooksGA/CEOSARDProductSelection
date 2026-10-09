import { describe, expect, it } from 'vitest';
import { addComparison, COVERAGE_SCALE, evaluateCriterion, evaluateProduct, GROUP_ELIGIBLE, GROUP_NEAR, GROUP_STRONG, groupAndSort } from '../../src/lib/domain/matching';
import type { Product, Profile } from '../../src/lib/domain/types';
import { parity } from './fixtures';

const fixture = parity('matching_cases.json');
const catalogue: Product[] = parity('catalogue_normalised.json');
const synthetic: Product[] = fixture.synthetic_products;
const products = [...catalogue, ...synthetic];
const byId = Object.fromEntries(products.map((p) => [p.id, p]));

const slim = (item: any) => ({ id: item.product.id, group: item.group, states: item.states, preferred_met: item.preferred_met, unknown_count: item.unknown_count, summary: item.summary });

describe('matching parity with legacy Python', () => {
	it('keeps group names and coverage scale', () => {
		expect([GROUP_STRONG, GROUP_ELIGIBLE, GROUP_NEAR]).toEqual(fixture.groups);
		expect(COVERAGE_SCALE).toEqual(fixture.coverage_scale);
	});

	it('evaluates every criterion boundary identically', () => {
		for (const testCase of fixture.criteria) {
			expect([testCase.id, testCase.name, testCase.target, evaluateCriterion(byId[testCase.id]!, testCase.name, testCase.target)]).toEqual([
				testCase.id,
				testCase.name,
				testCase.target,
				testCase.state
			]);
		}
	});

	for (const testCase of fixture.profiles) {
		const profile: Profile = testCase.profile;
		it(`evaluates and groups identically for profile ${profile.id}`, () => {
			expect(products.map((p) => slim(evaluateProduct(p, profile)))).toEqual(testCase.evaluated);
			const grouped = groupAndSort(products, profile);
			const actual = Object.fromEntries(Object.entries(grouped).map(([name, items]) => [name, items.map(slim)]));
			expect(actual).toEqual(testCase.groups);
		});
	}

	it('adds comparison IDs uniquely without displacement', () => {
		for (const testCase of fixture.add_comparison) {
			expect(addComparison(testCase.selection, testCase.candidate)).toEqual([testCase.updated, testCase.accepted]);
		}
	});
});

describe('matching rules (ported unit tests)', () => {
	const profile = (spatialMode = 'required', spatial = 30, bitMode = 'preferred') => ({
		criteria: { spatial_resolution_m: { mode: spatialMode, value: spatial }, radiometric_bit_depth: { mode: bitMode, value: 12 } }
	});
	const product = (id: string, name: string, spatial: number | null, bits: number | null = 12) => ({ ...catalogue[0]!, id, product_name: name, spatial_resolution_m: spatial, radiometric_bit_depth: bits });

	it('required criterion passes and fails', () => {
		expect(groupAndSort([product('a', 'Alpha', 20)], profile())[GROUP_STRONG]!.map((i) => i.product.id)).toEqual(['a']);
		expect(evaluateProduct(product('a', 'Alpha', 60), profile()).group).toBe(GROUP_NEAR);
	});
	it('required unknown is a manual check, never a pass', () => {
		const result = evaluateProduct(product('a', 'Alpha', null), profile());
		expect(result.group).toBe(GROUP_NEAR);
		expect(result.states.spatial_resolution_m).toBe('unknown');
	});
	it('preferred criteria determine the strong group; optional unknowns sort last', () => {
		const groups = groupAndSort([product('b', 'Beta', 20, 8), product('a', 'Alpha', 20, 12)], profile());
		expect(groups[GROUP_STRONG]!.map((i) => i.product.id)).toEqual(['a']);
		expect(groups[GROUP_ELIGIBLE]!.map((i) => i.product.id)).toEqual(['b']);
		const unknown = groupAndSort([product('u', 'Unknown', 20, null), product('r', 'Reported', 20, 8)], profile());
		expect(unknown[GROUP_ELIGIBLE]!.at(-1)!.product.id).toBe('u');
	});
	it('ties break by case-insensitive name', () => {
		const groups = groupAndSort([product('z', 'Zulu', 20), product('a', 'alpha', 20)], profile());
		expect(groups[GROUP_STRONG]!.map((i) => i.product.product_name)).toEqual(['alpha', 'Zulu']);
	});
});
