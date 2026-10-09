import { describe, expect, it } from 'vitest';
import { CatalogueError, deduplicateProducts, loadCatalogue, loadProfiles, normaliseProduct } from '../../src/lib/domain/catalogue';
import { parity, readJson } from './fixtures';

describe('catalogue parity with legacy Python', () => {
	it('normalises the researched catalogue exactly as Product.from_dict did', () => {
		const result = loadCatalogue({ researched: readJson('data/ceos_ard_products.json') });
		expect(result.source).toBe('researched');
		expect(result.products).toEqual(parity('catalogue_normalised.json'));
		expect(result.products).toHaveLength(26);
		expect(new Set(result.products.map((p) => p.id)).size).toBe(26);
		expect(result.products.every((p) => p.ceos_ard_verified)).toBe(true);
	});

	it('falls back to demo records with the explicit status overlay only when the researched file is absent', () => {
		const result = loadCatalogue({ demo: readJson('data/demo_products.json'), status: readJson('data/ceos_ard_status.json') });
		expect(result.source).toBe('demo-fallback');
		expect(result.products).toEqual(parity('catalogue_fallback_normalised.json'));
	});

	it('ignores the status overlay when the researched catalogue exists', () => {
		const researched = [{ id: 'landsat-8-collection-2', product_name: 'X', ceos_ard_verified: false }];
		const result = loadCatalogue({ researched, status: readJson('data/ceos_ard_status.json'), demo: [] });
		expect(result.products[0]!.ceos_ard_verified).toBe(false);
	});

	it('reproduces Product.from_dict defaults and derived fields', () => {
		const fixture = parity('product_from_dict.json');
		for (const testCase of fixture.cases) expect(normaliseProduct(testCase.input)).toEqual(testCase.output);
		for (const testCase of fixture.errors) {
			if (testCase.error) expect(() => normaliseProduct(testCase.input)).toThrow(CatalogueError);
			else expect(() => normaliseProduct(testCase.input)).not.toThrow();
		}
	});

	it('normalises built-in profiles exactly', () => {
		expect(loadProfiles(readJson('data/default_profiles.json'))).toEqual(parity('profiles_normalised.json'));
	});

	it('reports duplicate, malformed and invalid records clearly', () => {
		expect(() => loadCatalogue({ researched: [{ id: 'a', product_name: 'A' }, { id: 'a', product_name: 'B' }] })).toThrow('Duplicate product identifier: a');
		expect(() => loadCatalogue({ researched: { not: 'a list' } })).toThrow('unexpected top-level structure');
		expect(() => loadCatalogue({ researched: [{ id: 'broken' }] })).toThrow('Product record broken is invalid');
		expect(() => loadCatalogue({ researched: [{ id: 'a', product_name: 'A', spatial_resolution_m: '30' }] })).toThrow('spatial_resolution_m must be a number');
		expect(() => loadCatalogue({ researched: [{ id: 'bad id', product_name: 'A' }] })).toThrow('not a stable ID');
		expect(() => loadCatalogue({})).toThrow('demo_products.json');
		const skipped = loadCatalogue({ researched: [null, { product_name: 'no id' }, { id: 'ok', product_name: 'OK' }] });
		expect(skipped.products.map((p) => p.id)).toEqual(['ok']);
		expect(skipped.warnings).toHaveLength(2);
		expect(() => loadProfiles([{ id: 'broken' }])).toThrow(CatalogueError);
	});

	it('deduplicates by stable ID, first occurrence wins, without fuzzy merging', () => {
		const records = [
			{ id: 'a', n: 1 },
			{ id: 'b', n: 2 },
			{ id: 'a', n: 3 },
			{ id: 'A', n: 4 }
		];
		expect(deduplicateProducts(records)).toEqual([records[0], records[1], records[3]]);
	});
});
