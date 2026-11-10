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

	it('skips reports for unknown products and refuses two reports for one product', () => {
		const unknown = raw();
		unknown.product.explorer_id = 'not-in-catalogue';
		expect(loadCqasReports({ '/data/cqas/x.json': unknown }, catalogueIds).warnings[0]).toMatch(/unknown product not-in-catalogue/);
		expect(() => loadCqasReports({ '/a.json': raw(), '/b.json': raw() }, catalogueIds)).toThrow(/More than one/);
	});
});
