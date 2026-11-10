import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	CqasReportError,
	cqasOneLine,
	findingCounts,
	geometricMetres,
	headlineBand,
	loadCqasReports,
	parseCqasReport,
	pfsVersionDiffers,
	signed,
	thresholdHeadline
} from '../../src/lib/domain/cqas';
import { readJson, ROOT } from './fixtures';

const raw = () => structuredClone(readJson<any>('data/cqas/landsat-c2-sr.json'));
const catalogueIds = readJson<{ id: string }[]>('data/ceos_ard_products.json').map((p) => p.id);

describe('C-QAS report format', () => {
	it('accepts the bundled example and keeps it labelled as example data', () => {
		const report = parseCqasReport(raw());
		expect(report.data_status).toBe('example');
		expect(report.status_note).toMatch(/No scene has been assessed/);
		expect(report.product.explorer_id).toBe('landsat-c2-sr');
		expect(report.findings).toHaveLength(9);
		expect(report.pfs.total_requirements).toBe(36);
	});

	it('every bundled report validates and refers to a curated product', () => {
		const files = Object.fromEntries(readdirSync(resolve(ROOT, 'data/cqas')).filter((name) => name.endsWith('.json')).map((name) => [`/data/cqas/${name}`, readJson(`data/cqas/${name}`)]));
		const result = loadCqasReports(files, catalogueIds);
		expect(result.warnings).toEqual([]);
		expect(Object.keys(result.reports)).toContain('landsat-c2-sr');
		for (const [name, report] of Object.entries(files)) expect(name).toBe(`/data/cqas/${(report as any).product.explorer_id}.json`);
	});

	it('reproduces the values shown in the reporting demo', () => {
		const report = parseCqasReport(raw());
		expect(thresholdHeadline(report)).toBe('6 Met / 2 Not met');
		expect(findingCounts(report, 'threshold')).toEqual({ Met: 6, 'Not met': 2, 'Not assessed': 0, 'Not required': 1 });
		expect(findingCounts(report, 'goal')).toEqual({ Met: 3, 'Not met': 5, 'Not assessed': 1, 'Not required': 0 });
		expect(geometricMetres(report)).toBeCloseTo(12.6, 6);
		expect(headlineBand(report)).toEqual({ band: 'B4', difference: 0.006, uncertainty_k1: 0.004 });
		expect(signed(-0.002)).toBe('−0.002');
		expect(report.run.code).toBe('C031-S502-G1-R1-D01');
		expect(cqasOneLine(report)).toBe('6 Met / 2 Not met selected Threshold rows (9 of 36); geometric 0.42 pixel radial RMSE; radiometric +0.006 SR difference (B4) for one scene');
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
		bad.radiometric.headline_band = 'B9';
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
		expect(message).toMatch(/headline_band must name one of the bands/);
		expect(message).toMatch(/report_date must be an ISO date/);
	});

	it('rejects a wrong schema, duplicate requirement IDs and a run code that does not match its segments', () => {
		expect(() => parseCqasReport({ ...raw(), schema: 'cqas-report/2' })).toThrow(/schema must be/);
		const dup = raw();
		dup.findings[1].id = dup.findings[0].id;
		expect(() => parseCqasReport(dup)).toThrow(/duplicate requirement id/);
		const code = raw();
		code.run.code = 'C031-S502';
		expect(() => parseCqasReport(code)).toThrow(/run\.code must equal/);
		expect(() => parseCqasReport(null)).toThrow(CqasReportError);
	});

	it('rejects unknown fields, impossible dates, a zero pixel size and duplicate bands', () => {
		const bad = raw();
		bad.geometric.limitpx = 0.5;
		bad.findings[0].reasons = 'typo';
		bad.scene.acquisition_date = '2026-02-30';
		bad.geometric.pixel_size_m = 0;
		bad.radiometric.bands[1].band = 'B2';
		expect(() => parseCqasReport(bad)).toThrow(/geometric has unknown field: limitpx/);
		expect(() => parseCqasReport(bad)).toThrow(/findings\[0\] has unknown field: reasons/);
		expect(() => parseCqasReport(bad)).toThrow(/acquisition_date must be an ISO date/);
		expect(() => parseCqasReport(bad)).toThrow(/pixel_size_m must be a number > 0/);
		expect(() => parseCqasReport(bad)).toThrow(/duplicate band names/);
		const limit = raw();
		limit.geometric.limit_source = null;
		expect(() => parseCqasReport(limit)).toThrow(/limit_source is required/);
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
