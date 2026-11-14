import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	CqasReportError,
	cqasLines,
	cqasOneLine,
	cqasSummary,
	findingCounts,
	geometricMetres,
	headlineChannel,
	loadCqasReports,
	parseCqasReport,
	pfsVersionDiffers,
	radValue,
	relativePercent,
	seriesStats,
	signed,
	thresholdHeadline
} from '../../src/lib/domain/cqas';
import { buildComparison } from '../../src/lib/domain/comparison';
import { NEUTRAL_STATE } from '../../src/lib/domain/explorer';
import { buildSelectionSummary } from '../../src/lib/domain/summary';
import { parity, readJson, ROOT } from './fixtures';

const raw = () => structuredClone(readJson<any>('data/cqas/landsat-c2-sr.json'));
const catalogueIds = readJson<{ id: string }[]>('data/ceos_ard_products.json').map((p) => p.id);

describe('C-QAS report format', () => {
	it('accepts the bundled example and keeps it labelled as example data', () => {
		const report = parseCqasReport(raw());
		expect(report.data_status).toBe('example');
		expect(report.status_note).toMatch(/C-QAS has not run on any real scene yet/);
		expect(report.product.explorer_id).toBe('landsat-c2-sr');
		expect(report.domain).toBe('optical');
		expect(report.findings).toHaveLength(9);
		expect(report.pfs.total_requirements).toBe(36);
	});

	it('every curated product has a valid example report named after it', () => {
		const files = Object.fromEntries(readdirSync(resolve(ROOT, 'data/cqas')).filter((name) => name.endsWith('.json')).map((name) => [`/data/cqas/${name}`, readJson(`data/cqas/${name}`)]));
		const result = loadCqasReports(files, catalogueIds);
		expect(result.warnings).toEqual([]);
		expect(Object.keys(result.reports).sort()).toEqual([...catalogueIds].sort());
		for (const [name, report] of Object.entries(files)) expect(name).toBe(`/data/cqas/${(report as any).product.explorer_id}.json`);
		for (const report of Object.values(result.reports)) expect(report.data_status).toBe('example');
	});

	it('the example reports match what the generator writes', () => {
		expect(() => execFileSync(process.execPath, [resolve(ROOT, 'tools/build_cqas_examples.mjs'), '--check'], { stdio: 'pipe' })).not.toThrow();
	});

	it('example values are plausible for each product, not copies of one another', () => {
		const reports = Object.values(
			loadCqasReports(Object.fromEntries(readdirSync(resolve(ROOT, 'data/cqas')).map((name) => [`/data/cqas/${name}`, readJson(`data/cqas/${name}`)])), catalogueIds).reports
		);
		const catalogue = readJson<any[]>('data/ceos_ard_products.json');
		const family = (id: string) => catalogue.find((p) => p.id === id)!.product_family as string;
		for (const report of reports) {
			const fam = family(report.product.explorer_id);
			// Domain and units follow the product family.
			if (fam === 'Surface Reflectance') expect([report.domain, report.radiometric?.units]).toEqual(['optical', '1']);
			if (fam === 'Surface Temperature') expect([report.domain, report.radiometric?.units]).toEqual(['thermal', 'K']);
			if (fam === 'Synthetic Aperture Radar') {
				expect(report.domain).toBe('radar');
				expect(report.geometric.kind).toBe('absolute');
				if (report.radiometric) expect(report.radiometric.units).toBe('dB');
			}
			// Sizes stay in a sensible range.
			const channel = headlineChannel(report);
			if (report.radiometric && channel) {
				const limit = { '1': 0.03, K: 3, dB: 1 }[report.radiometric.units]!;
				expect(Math.abs(channel.difference)).toBeLessThan(limit);
			}
			expect(report.geometric.radial_rmse_px * report.geometric.pixel_size_m).toBeLessThan(100);
			// At most two Threshold gaps, as expected for an assessed product.
			expect(findingCounts(report, 'threshold')['Not met']).toBeLessThanOrEqual(2);
		}
		const signatures = new Set(reports.map((r) => JSON.stringify([r.geometric.comparisons_px, r.radiometric?.channels.map((c) => c.difference), r.scene.product_id])));
		expect(signatures.size).toBe(reports.length);
	});

	it('reproduces the values shown in the reporting demo', () => {
		const report = parseCqasReport(raw());
		expect(thresholdHeadline(report)).toBe('6 Met / 2 Not met');
		expect(findingCounts(report, 'threshold')).toEqual({ Met: 6, 'Not met': 2, 'Not assessed': 0, 'Not required': 1 });
		expect(findingCounts(report, 'goal')).toEqual({ Met: 3, 'Not met': 5, 'Not assessed': 1, 'Not required': 0 });
		expect(geometricMetres(report)).toBeCloseTo(12.6, 6);
		expect(headlineChannel(report)).toEqual({ channel: 'B4', name: 'red', difference: 0.006, uncertainty_k1: 0.004, reference_value: 0.334 });
		expect(relativePercent(headlineChannel(report)!)).toBeCloseTo(1.796, 2);
		expect(signed(-0.002)).toBe('−0.002');
		expect(report.run.code).toBe('C031-S502-G1-R1-D01');
		expect(cqasLines(report)[0]).toBe('PFS: 6 Met / 2 Not met (9 of 36 requirements checked)');
		expect(cqasLines(report)[1]).toBe('Geometric: 12.6 m relative geometric error (0.42 pixel)');
		expect(cqasLines(report)[2]).toMatch(/^Radiometric: mean [+−]0\.\d{3} SR difference, B4, over 17 scenes at 3 sites$/);
		expect(cqasOneLine(report)).toBe(cqasLines(report).join('; '));
	});

	it('formats each domain in its own units and summarises a series', () => {
		const thermal = parseCqasReport(readJson('data/cqas/landsat-c2-st.json'));
		expect(radValue(thermal.radiometric!, -0.62)).toBe('−0.62 K');
		const radar = parseCqasReport(readJson('data/cqas/ga-sentinel1-nrb.json'));
		expect(radValue(radar.radiometric!, 0.17)).toBe('+0.17 dB');
		const mosaic = parseCqasReport(readJson('data/cqas/alos2-palsar2-global-mosaics-rtc.json'));
		expect(mosaic.radiometric).toBeNull();
		expect(mosaic.radiometric_note).toMatch(/mosaic/);
		expect(mosaic.series?.test).toBe('geometric');
		expect(cqasLines(mosaic)[2]).toBe('Radiometric: no test defined for this product type');
		const stats = seriesStats({ test: 'radiometric', description: '', channel: 'B4', units: '1', decimals: 3, note: null, sites: [], points: [
			{ date: '2025-01-01', site: 'A', value: 0.004, uncertainty_k1: 0.004 },
			{ date: '2025-02-01', site: 'B', value: 0.01, uncertainty_k1: 0.004 },
			{ date: '2025-03-01', site: 'A', value: -0.002, uncertainty_k1: 0.004 }
		] })!;
		expect(stats).toMatchObject({ scenes: 3, sites: 2, start: '2025-01-01', end: '2025-03-01' });
		expect(stats.mean).toBeCloseTo(0.004, 6);
		expect(stats.sd).toBeCloseTo(0.006, 6);
		expect(stats.withinK2).toBe(2);
		expect(cqasSummary(thermal)).toEqual({ data_status: 'example', lines: cqasLines(thermal), provenance: 'Example data · PFS ST v6.0.0 · report DEMO-L8-ST-001 (2026-10-12)' });
	});

	it('flags the PFS version difference with the CEOS-ARD assessment', () => {
		const report = parseCqasReport(raw());
		expect(pfsVersionDiffers(report, 'v5.0')).toBe(true);
		expect(pfsVersionDiffers(report, '5.0.2')).toBe(false);
		expect(pfsVersionDiffers(report, null)).toBe(false);
	});

	it('rejects malformed reports with every problem listed', () => {
		const bad = raw();
		bad.data_status = 'final';
		bad.findings[0].threshold = 'Pass';
		bad.geometric.matches_accepted = 200;
		bad.radiometric.headline_channel = 'B9';
		bad.report_date = '12/10/2026';
		let message = '';
		try {
			parseCqasReport(bad);
		} catch (error) {
			expect(error).toBeInstanceOf(CqasReportError);
			message = (error as Error).message;
		}
		expect(message).toMatch(/data_status must be one of/);
		expect(message).toMatch(/findings\[0\]\.threshold/);
		expect(message).toMatch(/matches_accepted cannot exceed/);
		expect(message).toMatch(/headline_channel must name one of the channels/);
		expect(message).toMatch(/report_date must be an ISO date/);
	});

	it('rejects a wrong schema, duplicate requirement IDs and a run code that does not match its segments', () => {
		expect(() => parseCqasReport({ ...raw(), schema: 'cqas-report/1' })).toThrow(/schema must be/);
		const dup = raw();
		dup.findings[1].id = dup.findings[0].id;
		expect(() => parseCqasReport(dup)).toThrow(/duplicate requirement id/);
		const code = raw();
		code.run.code = 'C031-S502';
		expect(() => parseCqasReport(code)).toThrow(/run\.code must equal/);
		expect(() => parseCqasReport(null)).toThrow(CqasReportError);
	});

	it('rejects unknown fields, impossible dates, a zero pixel size and duplicate channels', () => {
		const bad = raw();
		bad.geometric.limitpx = 0.5;
		bad.findings[0].reasons = 'typo';
		bad.scene.acquisition_date = '2026-02-30';
		bad.geometric.pixel_size_m = 0;
		bad.radiometric.channels[1].channel = 'B2';
		expect(() => parseCqasReport(bad)).toThrow(/geometric has unknown field: limitpx/);
		expect(() => parseCqasReport(bad)).toThrow(/findings\[0\] has unknown field: reasons/);
		expect(() => parseCqasReport(bad)).toThrow(/acquisition_date must be an ISO date/);
		expect(() => parseCqasReport(bad)).toThrow(/pixel_size_m must be a number > 0/);
		expect(() => parseCqasReport(bad)).toThrow(/duplicate channel names/);
		const limit = raw();
		limit.geometric.limit_source = null;
		expect(() => parseCqasReport(limit)).toThrow(/limit_source is required/);
	});

	it('checks that units, the numeric test and dates agree', () => {
		const units = raw();
		units.radiometric.units = 'K';
		expect(() => parseCqasReport(units)).toThrow(/radiometric\.units must be "1" for the optical domain/);
		const numeric = raw();
		numeric.geometric.numeric_test = 'Not met';
		expect(() => parseCqasReport(numeric)).toThrow(/numeric_test does not agree/);
		const noLimit = raw();
		noLimit.geometric.limit_px = null;
		noLimit.geometric.limit_source = null;
		expect(() => parseCqasReport(noLimit)).toThrow(/numeric_test must be Not assessed when there is no limit/);
		const late = raw();
		late.scene.acquisition_date = '2026-12-01';
		expect(() => parseCqasReport(late)).toThrow(/acquisition_date cannot be after report_date/);
		const both = raw();
		both.radiometric_note = 'extra';
		expect(() => parseCqasReport(both)).toThrow(/radiometric_note must be null/);
		const seriesUnits = raw();
		seriesUnits.series.decimals = 2;
		expect(() => parseCqasReport(seriesUnits)).toThrow(/series units and decimals must match/);
	});

	it('checks the radiometric note and the series', () => {
		const none = raw();
		none.radiometric = null;
		none.series = null;
		expect(() => parseCqasReport(none)).toThrow(/radiometric_note is required when radiometric is null/);
		none.radiometric_note = 'No test defined.';
		expect(parseCqasReport(none).radiometric).toBeNull();
		const orphan = raw();
		orphan.radiometric = null;
		orphan.radiometric_note = 'No test defined.';
		expect(() => parseCqasReport(orphan)).toThrow(/series\.test cannot be radiometric/);
		const bad = raw();
		bad.series.points[0].site = 'NOWHERE';
		bad.series.points.reverse();
		bad.series.channel = 'B9';
		expect(() => parseCqasReport(bad)).toThrow(/must be one of series\.sites/);
		expect(() => parseCqasReport(bad)).toThrow(/must be in date order/);
		expect(() => parseCqasReport(bad)).toThrow(/series\.channel must name one of the radiometric channels/);
		const one = raw();
		one.series.points = one.series.points.slice(0, 1);
		expect(() => parseCqasReport(one)).toThrow(/points must be a list with at least 2 items/);
	});

	it('never throws at runtime: bad, unknown, misnamed and duplicate reports are skipped with warnings', () => {
		const unknown = raw();
		unknown.product.explorer_id = 'not-in-catalogue';
		const invalid = raw();
		invalid.data_status = 'final';
		const result = loadCqasReports(
			{
				'/data/cqas/landsat-c2-sr.json': raw(),
				'/data/cqas/not-in-catalogue.json': unknown,
				'/data/cqas/sentinel2-level2a.json': invalid,
				'/data/cqas/wrong-name.json': raw()
			},
			catalogueIds
		);
		expect(Object.keys(result.reports)).toEqual(['landsat-c2-sr']);
		expect(result.warnings.join('\n')).toMatch(/unknown product not-in-catalogue/);
		expect(result.warnings.join('\n')).toMatch(/sentinel2-level2a\.json is invalid/);
		expect(result.warnings.join('\n')).toMatch(/wrong-name\.json must be named landsat-c2-sr\.json/);
		const twice = loadCqasReports({ '/x/landsat-c2-sr.json': raw(), '/y/landsat-c2-sr.json': raw() }, catalogueIds);
		expect(twice.warnings[0]).toMatch(/More than one/);
	});

	it('rounds before choosing a sign', () => {
		expect(signed(0.0004)).toBe('0.000');
		expect(signed(-0.0004)).toBe('0.000');
		expect(signed(0.0006)).toBe('+0.001');
	});
});

describe('C-QAS in comparison and the copied summary', () => {
	const catalogue = parity<any[]>('catalogue_normalised.json');
	const byId = Object.fromEntries(catalogue.map((p) => [p.id, p]));
	const landsat = parseCqasReport(raw());
	const summaries = { 'landsat-c2-sr': cqasSummary(landsat) };
	const pair = [byId['landsat-c2-sr'], byId['sentinel2-level2a']];
	const cqasRow = (products: any[], withReports = true) =>
		buildComparison(products, {}, [], {}, null, withReports ? { summaries, detailHref: (p) => `/products/${p.id}?v=1` } : null)
			.find((g) => g.id === 'quality')!
			.rows.find((r) => r.id === 'cqas');

	it('adds a C-QAS row to measured quality evidence, with "No C-QAS check" for products without a report', () => {
		const row = cqasRow(pair)!;
		expect(row.label).toBe('C-QAS checks (proposed)');
		expect(row.incomparable).toBeUndefined();
		expect(row.help).toMatch(/separate from the CEOS-ARD assessment/);
		expect(row.cells[0]!.text).toBe('PFS: 6 Met / 2 Not met (9 of 36 requirements checked)');
		expect(row.cells[0]!.lines).toEqual(cqasLines(landsat).slice(1));
		expect(row.cells[0]!.detail).toBe('Example data · PFS SR v5.0.2 · report DEMO-L8-001 (2026-10-12)');
		expect(row.cells[0]!.links).toEqual([{ label: 'See C-QAS quality checks', url: '/products/landsat-c2-sr?v=1#cqas', internal: true }]);
		expect(row.cells[1]).toEqual({ text: null, missingText: 'No C-QAS check' });
		expect(row.differs).toBe(true);
	});

	it('leaves the other quality rows unchanged and marks two reports as not directly comparable', () => {
		const quality = (withReports: boolean) => buildComparison(pair, {}, [], {}, null, withReports ? { summaries, detailHref: () => '/' } : null).find((g) => g.id === 'quality')!.rows;
		expect(quality(true).slice(0, 2)).toEqual(quality(false));
		const second = cqasSummary(parseCqasReport(readJson('data/cqas/sentinel2-level2a.json')));
		const both = buildComparison(pair, {}, [], {}, null, { summaries: { ...summaries, 'sentinel2-level2a': second }, detailHref: () => '/' });
		expect(both.find((g) => g.id === 'quality')!.rows.find((r) => r.id === 'cqas')!.incomparable).toMatch(/different scenes and sites/);
	});

	it('omits the row when no compared product has a report, or when no reports are passed', () => {
		expect(cqasRow([byId['sentinel2-level2a'], byId['enmap-l2a']])).toBeUndefined();
		expect(cqasRow(pair, false)).toBeUndefined();
	});

	it('adds a labelled C-QAS line to the copied summary for products with a report only', () => {
		const text = buildSelectionSummary({
			snapshot: new Date('2026-11-10T00:00:00Z'),
			shareUrl: 'https://example.test/shortlist?v=1',
			state: { ...structuredClone(NEUTRAL_STATE), shortlist: ['landsat-c2-sr', 'sentinel2-level2a'] },
			products: byId,
			notes: {},
			investigationNote: '',
			currentFingerprint: '',
			provenance: {},
			unresolvedReason: () => '',
			cqasSummaries: summaries
		});
		expect(text).toContain(`  C-QAS checks (proposed): ${cqasOneLine(landsat)}.`);
		expect(text).toContain('  C-QAS details: Example data · PFS SR v5.0.2 · report DEMO-L8-001 (2026-10-12). Not a CEOS-ARD assessment.');
		expect(text.match(/C-QAS checks \(proposed\)/g)).toHaveLength(1);
	});
});
