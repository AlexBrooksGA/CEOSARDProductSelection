import { describe, expect, it } from 'vitest';
import { buildComparison } from '../../src/lib/domain/comparison';
import { criteriaFingerprint } from '../../src/lib/domain/criteria';
import { clearCriteria, matchingCriteria, NEUTRAL_STATE, toFilterState, type ExplorerState } from '../../src/lib/domain/explorer';
import { accessAction, bitDepthFact, missingState, qualityEvidence, spatialFact } from '../../src/lib/domain/facts';
import { exclusions, metadataFilter } from '../../src/lib/domain/filters';
import { groupAndSort } from '../../src/lib/domain/matching';
import { presentResults } from '../../src/lib/domain/presentation';
import { buildCustomProfile, previewProfile, profileModified, profileNameError } from '../../src/lib/domain/profiles';
import { buildProvenanceIndex, parseCsv } from '../../src/lib/domain/provenance';
import { addToCompare, addToShortlist, removeFromCompare, removeFromShortlist } from '../../src/lib/domain/selection';
import { buildSelectionSummary, noteNeedsReview } from '../../src/lib/domain/summary';
import { casefold, compareCodePoints, formatG } from '../../src/lib/domain/text';
import type { Product, Profile } from '../../src/lib/domain/types';
import { parity, readJson, readText } from './fixtures';

const catalogue: Product[] = parity('catalogue_normalised.json');
const profiles: Profile[] = parity('profiles_normalised.json');
const byId = Object.fromEntries(catalogue.map((p) => [p.id, p]));
const provenance = buildProvenanceIndex(readText('data/ceos_ard_research_log.csv'));
const state = (patch: Partial<ExplorerState> = {}): ExplorerState => ({ ...structuredClone(NEUTRAL_STATE), ...patch });

function run(s: ExplorerState, products = catalogue) {
	const criteria = matchingCriteria(s);
	return presentResults(groupAndSort(metadataFilter(products, toFilterState(s)), { criteria }), criteria);
}

describe('text helpers', () => {
	it('formats like Python :g and folds case like casefold', () => {
		expect([2.5, 30, 2000, 1e-5, 1234567, 0.0001, 100000, 999999.5].map(formatG)).toEqual(['2.5', '30', '2000', '1e-05', '1.23457e+06', '0.0001', '100000', '1e+06']);
		expect(casefold('STRASSE')).toBe(casefold('Straße'));
		expect(compareCodePoints('Ａ', '\u{1d4d0}')).toBeLessThan(0);
	});
});

describe('neutral browse state and presentation layer', () => {
	it('opens with all families, assessed scope, no criteria and no launch-year cut-off', () => {
		const result = run(state());
		expect(result.mode).toBe('browse');
		expect(result.counts.total).toBe(26);
		expect(result.sections).toHaveLength(1);
		expect(result.sections[0]!.title).toBe('Browse products');
		const names = result.sections[0]!.items.map((i) => i.result.product.product_name.toLowerCase());
		expect(names).toEqual([...names].sort());
	});

	it('keeps preference ordering in one explained list without calling it a ranking', () => {
		const result = run(state({ criteria: { spatial_resolution_m: { mode: 'preferred', value: 30 } } }));
		expect(result.mode).toBe('preferences');
		expect(result.sections[0]!.description).toContain('not a quality or suitability ranking');
		expect(result.sections[0]!.items.slice(0, 21).every((i) => i.result.group === 'Closer profile matches')).toBe(true);
	});

	it('separates reported required mismatch from insufficient evidence, counting mixed records once in original order', () => {
		const s = state({ family: 'Surface Reflectance', criteria: { revisit_days: { mode: 'required', value: 5 }, spatial_resolution_m: { mode: 'required', value: 10 } } });
		const result = run(s);
		expect(result.mode).toBe('requirements');
		const [meet, outside, evidence] = result.sections;
		expect(meet!.items.map((i) => i.result.product.id)).toEqual(['earthdaily-constellation', 'sentinel2-level2a']);
		const outsideIds = outside!.items.map((i) => i.result.product.id);
		const evidenceIds = evidence!.items.map((i) => i.result.product.id);
		expect(outsideIds.filter((id) => evidenceIds.includes(id))).toEqual([]);
		expect(result.counts.manualCheck).toBe(outsideIds.length + evidenceIds.length);
		const desis = outside!.items.find((i) => i.result.product.id === 'desis-l2a');
		expect(desis?.requiredOutside.map((r) => r.name)).toEqual(['spatial_resolution_m']);
		expect(desis?.requiredUnknown.map((r) => r.name)).toEqual(['revisit_days']);
		const near = groupAndSort(metadataFilter(catalogue, toFilterState(s)), { criteria: matchingCriteria(s) })['Manual task check']!.map((i) => i.product.id);
		expect(outsideIds).toEqual(near.filter((id) => outsideIds.includes(id)));
		expect(evidenceIds).toEqual(near.filter((id) => evidenceIds.includes(id)));
	});

	it('the hide-unreported option no longer hides every curated record (launch-year clause removed)', () => {
		expect(run(state({ hideUnknown: true })).counts.total).toBe(26);
		expect(run(state({ hideUnknown: true, criteria: { revisit_days: { mode: 'preferred', value: 16 } } })).counts.total).toBe(catalogue.filter((p) => p.revisit_days !== null).length);
	});

	it('explains why a shortlisted record is outside current results', () => {
		const reasons = exclusions(byId['ga-sentinel1-nrb']!, toFilterState(state({ family: 'Surface Reflectance', search: 'landsat' })));
		expect(reasons.map((r) => r.kind)).toEqual(['family', 'search']);
	});
});

describe('profiles', () => {
	it('preserves built-in profile values when applied and lists retained constraints', () => {
		const map = profiles.find((p) => p.id === 'map-land-features')!;
		const preview = previewProfile(state({ search: 'sentinel', shortlist: ['a', 'b', 'c', 'd'], compare: ['a'] }), map);
		expect(preview.next.family).toBe('Surface Reflectance');
		expect(preview.next.criteria).toEqual({ spatial_resolution_m: { mode: 'required', value: 10 }, revisit_days: { mode: 'required', value: 30 } });
		expect(preview.next.search).toBe('sentinel');
		expect(preview.next.shortlist).toEqual(['a', 'b', 'c', 'd']);
		expect(preview.retained.join(' ')).toContain('sentinel');
		expect(preview.changes.map((c) => c.label)).toEqual(['Measurement family', 'Spatial resolution', 'Nominal revisit']);
		expect(profileModified(preview.next, map)).toBe(false);
		expect(profileModified({ ...preview.next, criteria: { ...preview.next.criteria, geographic_coverage: { mode: 'preferred', value: 'Global' } } }, map)).toBe(true);
		const explore = previewProfile(state(), profiles[0]!);
		expect(explore.next.criteria).toEqual({ spatial_resolution_m: { mode: 'preferred', value: 30 } });
	});

	it('clear criteria keeps the catalogue scope and selections', () => {
		const cleared = clearCriteria(state({ scope: 'All statuses', search: 'x', family: 'Surface Temperature', criteria: { revisit_days: { mode: 'required', value: 5 } }, shortlist: ['a'] }));
		expect(cleared.scope).toBe('All statuses');
		expect(cleared.shortlist).toEqual(['a']);
		expect(cleared.criteria).toEqual({});
		expect(cleared.family).toBe('All product families');
	});

	it('validates custom profile names and builds the legacy profile shape', () => {
		expect(profileNameError('ab', profiles)).toContain('three');
		expect(profileNameError('x'.repeat(81), profiles)).toContain('80');
		expect(profileNameError('map LAND and features', profiles)).toContain('exists');
		const custom = buildCustomProfile({ id: 'custom-1', name: '  Radar   list ', description: '', family: 'Synthetic Aperture Radar', scope: 'CEOS-ARD assessed only', hideUnknown: false, criteria: { spatial_resolution_m: { mode: 'required', value: 20 } } });
		expect(custom.name).toBe('Radar list');
		expect(Object.keys(custom.criteria)).toEqual(Object.keys(profiles[0]!.criteria));
		expect(custom.criteria.spatial_resolution_m).toEqual({ mode: 'required', value: 20 });
	});
});

describe('selection', () => {
	it('keeps an independent shortlist and a non-displacing comparison of three', () => {
		let selection = { shortlist: [] as string[], compare: [] as string[] };
		for (const id of ['a', 'b', 'c', 'd']) selection = addToShortlist(selection, id).selection;
		for (const id of ['a', 'b', 'c']) selection = addToCompare(selection, id).selection;
		const full = addToCompare(selection, 'd');
		expect(full.ok).toBe(false);
		expect(full.selection.compare).toEqual(['a', 'b', 'c']);
		selection = removeFromCompare(selection, 'b');
		expect(selection.shortlist).toEqual(['a', 'b', 'c', 'd']);
		selection = removeFromShortlist(selection, 'a');
		expect(selection).toEqual({ shortlist: ['b', 'c', 'd'], compare: ['c'] });
	});
});

describe('facts and evidence', () => {
	it('keeps product and instrument resolution and storage distinctions', () => {
		const mim = { ...catalogue[0]!, source_type: 'MIM API product', spatial_resolution_m: null, spatial_resolution_display: null, spatial_resolution_options_m: [], instrument_spatial_resolution_best_m: 79, instrument_spatial_resolution_display: '79 m (DESIS)' };
		const fact = spatialFact(mim);
		expect(fact.label).toBe('Finest instrument resolution');
		expect(fact.displayOnly).toBe(true);
		expect(bitDepthFact(byId['landsat-c2-sr']!).label).toBe('Output storage');
		expect(missingState(byId['landsat-c2-sr']!, 'geometric_accuracy_display', provenance.index['landsat-c2-sr']).kind).toBe('not-found-in-checked-sources');
		expect(missingState(mim, 'x').text).toContain('MIM');
	});

	it('attaches source kind to quality evidence without implying independent validation', () => {
		const evidence = qualityEvidence(byId['constellr-lstprecision']!, 'geometric', provenance.index['constellr-lstprecision']);
		expect(evidence.reported).toBe(true);
		expect(evidence.sourceKind).toContain('provider-reported');
		expect(evidence.metric).toBe('spatial accuracy');
	});

	it('offers a documentation fallback when no access link is sourced', () => {
		const action = accessAction({ ...byId['landsat-c2-sr']!, access_url: null });
		expect(action.fallback).toBe(true);
		expect(action.url).toBe(byId['landsat-c2-sr']!.information_url);
	});
});

describe('Landsat C2 SR / Sentinel-2 L2A comparison example', () => {
	const pair = [byId['landsat-c2-sr']!, byId['sentinel2-level2a']!];
	const criteria = matchingCriteria(state({ criteria: { revisit_days: { mode: 'required', value: 5 } } }));
	const groups = buildComparison(pair, criteria, ['technical', 'provenance'], provenance.index);
	const rowsById = Object.fromEntries(groups.flatMap((g) => g.rows.map((r) => [r.id, r])));

	it('exposes assessment evidence, temporal distinctions, format/access and open checks without changing facts', () => {
		expect(groups.map((g) => g.id)).toEqual(['spatial-temporal', 'requirements', 'assessment', 'quality', 'access', 'technical', 'provenance']);
		expect(rowsById.pfs!.cells.map((c) => c.text)).toEqual(['Surface Reflectance v5.0', byId['sentinel2-level2a']!.ceos_ard_pfs]);
		expect(rowsById.approval!.cells.map((c) => c.text)).toEqual(['2021-06-04', byId['sentinel2-level2a']!.approval_date]);
		expect(rowsById.evidence!.cells.every((c) => c.links!.length === 2)).toBe(true);
		for (const id of ['revisit', 'update', 'record-period', 'local']) expect(rowsById[id]).toBeDefined();
		expect(rowsById['record-period']!.cells[0]!.missingText).toContain('Not established');
		expect(rowsById['criterion-revisit_days']!.cells.map((c) => c.state)).toEqual(['outside', 'met']);
		expect(rowsById.geometric!.cells[0]!.missingText).toContain('Not found in the sources checked');
		expect(rowsById.access!.cells.every((c) => c.link?.url)).toBe(true);
		expect(rowsById['open-checks']).toBeDefined();
		expect(rowsById.checked!.cells[0]!.text).toContain('2026-07-12');
	});
});

describe('selection summary', () => {
	it('includes IDs, criteria, rationale, open checks, links, dates, snapshot and review flag', () => {
		const s = state({ criteria: { revisit_days: { mode: 'required', value: 5 } }, shortlist: ['landsat-c2-sr', 'mim-product:9'], compare: ['landsat-c2-sr'] });
		const note = { rationale: 'Long archive', openChecks: 'Cloud cover in wet season', criteriaFingerprint: 'old', updatedAt: '2026-10-09' };
		expect(noteNeedsReview(note, criteriaFingerprint(s.criteria))).toBe(true);
		const text = buildSelectionSummary({
			snapshot: new Date('2026-10-09T00:00:00Z'),
			shareUrl: 'https://example.test/shortlist?v=1',
			state: s,
			products: byId,
			notes: { 'landsat-c2-sr': note },
			investigationNote: 'Wetland study',
			currentFingerprint: criteriaFingerprint(s.criteria),
			provenance: provenance.index,
			unresolvedReason: () => 'MIM records not loaded'
		});
		for (const expected of ['2026-10-09T00:00:00.000Z', '[landsat-c2-sr]', 'Nominal revisit ≤ 5 days · Required', 'Long archive', 'Cloud cover', 'REVIEW RATIONALE', 'approved 2021-06-04', 'mim-product:9 — record not available', 'not an approval or quality certificate', 'Wetland study', '2026-07-12']) {
			expect(text).toContain(expected);
		}
	});
});

describe('research log', () => {
	it('parses CSV with quotes and joins exactly one row per product and field', () => {
		expect(parseCsv('a,b\r\n"x, ""y""",z\n')).toEqual([['a', 'b'], ['x, "y"', 'z']]);
		const raw = readJson<any[]>('data/ceos_ard_products.json');
		const fields = new Set(Object.values(provenance.index).flatMap((f) => Object.keys(f)));
		expect(provenance.warnings).toEqual([]);
		for (const product of raw) for (const field of fields) expect(provenance.index[product.id]?.[field]).toBeDefined();
		for (const product of raw) {
			expect(product.approval_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			for (const field of ['access_url', 'information_url', 'self_assessment_url', 'peer_review_url', 'sample_product_url']) {
				expect(product[field] === null || /^https?:\/\//.test(product[field])).toBe(true);
			}
		}
	});
	it('does not join ambiguous duplicate rows', () => {
		const header = 'product_id,official_product_name,field_name,recorded_value,source_title,source_url,source_type,evidence_level,confidence,notes,date_checked';
		const result = buildProvenanceIndex(`${header}\na,A,f,1,s,u,t,e,c,n,d\na,A,f,2,s,u,t,e,c,n,d\na,A,f,3,s,u,t,e,c,n,d\n`);
		expect(result.index.a?.f).toBeUndefined();
		expect(result.rowCount).toBe(0);
	});
});
