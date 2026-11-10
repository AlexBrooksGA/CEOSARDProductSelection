/**
 * C-QAS report format ("cqas-report/1") — validation and derived values. Pure TypeScript.
 *
 * A C-QAS report describes one scene and its reference comparisons for one product. It is
 * separate from the product's CEOS-ARD assessment and never feeds matching or ordering.
 * The same file drives the C-QAS reporting demo and the Product Explorer, so both always
 * show the same values. Field reference: docs/CQAS_REPORT_FORMAT.md.
 */

export const CQAS_SCHEMA = 'cqas-report/1';

export class CqasReportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CqasReportError';
	}
}

/** `example`: mock values (current state). `provisional`: produced by C-QAS, not reviewed. `reviewed`: reviewed output. */
export const DATA_STATUSES = ['example', 'provisional', 'reviewed'] as const;
export type CqasDataStatus = (typeof DATA_STATUSES)[number];

export const FINDING_STATUSES = ['Met', 'Not met', 'Not assessed', 'Not required'] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

/** Outcomes for a single test (no "Not required"). */
export const TEST_STATUSES = ['Met', 'Not met', 'Not assessed'] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

export interface CqasFinding {
	requirement: string;
	id: string;
	threshold: FindingStatus;
	goal: FindingStatus;
	reason: string | null;
}

export interface CqasRunSegment {
	code: string;
	part: string;
	meaning: string;
}

export interface CqasBand {
	band: string;
	difference: number;
	uncertainty_k1: number;
}

export interface CqasReport {
	schema: typeof CQAS_SCHEMA;
	data_status: CqasDataStatus;
	status_note: string;
	report_id: string;
	report_date: string;
	product: { explorer_id: string; name: string; short_name: string };
	pfs: { name: string; short_name: string; version: string; total_requirements: number };
	scene: {
		product_id: string;
		platform: string;
		instrument: string;
		acquisition_date: string;
		path: number | null;
		row: number | null;
		reference_site: { network: string; code: string; name: string } | null;
		note: string | null;
	};
	run: { code: string; snapshot: string; reviewer: string | null; segments: CqasRunSegment[]; note: string | null };
	findings: CqasFinding[];
	findings_summary: string;
	geometric: {
		label: string;
		method: string;
		reference: string;
		comparison: string;
		method_notes: string | null;
		pixel_size_m: number;
		radial_rmse_px: number;
		comparisons_px: number[];
		limit_px: number | null;
		limit_source: string | null;
		matches_accepted: number;
		matches_total: number;
		positional_uncertainty: string | null;
		absolute_accuracy: TestStatus;
		numeric_test: TestStatus;
		requirement_result: TestStatus;
		requirement_reason: string | null;
	};
	radiometric: {
		label: string;
		method: string;
		reference: string;
		comparison: string;
		method_notes: string | null;
		units: string;
		headline_band: string;
		headline_band_name: string | null;
		bands: CqasBand[];
		pixels_used: number;
		pixels_total: number;
		unique_exclusions: number | null;
		product_uncertainty: string | null;
		accuracy_test: TestStatus;
		accuracy_reason: string | null;
		uncertainty_goal: TestStatus;
		uncertainty_goal_reason: string | null;
	};
	next_action: string;
	next_actions: string[];
	scope_note: string;
}

type Json = Record<string, unknown>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

class Reader {
	constructor(
		readonly errors: string[],
		private readonly path: string,
		private readonly value: Json
	) {}

	static object(errors: string[], path: string, value: unknown): Reader | null {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			errors.push(`${path} must be an object`);
			return null;
		}
		return new Reader(errors, path, value as Json);
	}

	private at(key: string): string {
		return `${this.path}.${key}`;
	}

	raw(key: string): unknown {
		return this.value[key];
	}

	/** Reject keys the format does not define, so a typo cannot silently drop a value. */
	only(keys: readonly string[]): this {
		const unknown = Object.keys(this.value).filter((key) => !keys.includes(key));
		if (unknown.length) this.errors.push(`${this.path} has unknown field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
		return this;
	}

	text(key: string): string {
		const value = this.value[key];
		if (typeof value !== 'string' || !value.trim()) {
			this.errors.push(`${this.at(key)} must be non-empty text`);
			return '';
		}
		return value.trim();
	}

	optionalText(key: string): string | null {
		const value = this.value[key];
		if (value === null || value === undefined) return null;
		if (typeof value !== 'string' || !value.trim()) {
			this.errors.push(`${this.at(key)} must be non-empty text or null`);
			return null;
		}
		return value.trim();
	}

	date(key: string): string {
		const value = this.text(key);
		const real = ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
		if (value && !real) this.errors.push(`${this.at(key)} must be an ISO date (YYYY-MM-DD)`);
		return value;
	}

	number(key: string, { min = -Infinity, integer = false, positive = false }: { min?: number; integer?: boolean; positive?: boolean } = {}): number {
		const value = this.value[key];
		if (typeof value !== 'number' || !Number.isFinite(value) || value < min || (positive && value <= 0) || (integer && !Number.isInteger(value))) {
			this.errors.push(`${this.at(key)} must be ${integer ? 'an integer' : 'a number'}${positive ? ' > 0' : min > -Infinity ? ` ≥ ${min}` : ''}`);
			return 0;
		}
		return value;
	}

	optionalNumber(key: string, options: { min?: number; integer?: boolean; positive?: boolean } = {}): number | null {
		const value = this.value[key];
		if (value === null || value === undefined) return null;
		return this.number(key, options);
	}

	oneOf<T extends string>(key: string, allowed: readonly T[]): T {
		const value = this.value[key];
		if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
			this.errors.push(`${this.at(key)} must be one of: ${allowed.join(', ')}`);
			return allowed[0]!;
		}
		return value as T;
	}

	list(key: string, { minLength = 0 }: { minLength?: number } = {}): unknown[] {
		const value = this.value[key];
		if (!Array.isArray(value) || value.length < minLength) {
			this.errors.push(`${this.at(key)} must be a list${minLength ? ` with at least ${minLength} item${minLength === 1 ? '' : 's'}` : ''}`);
			return [];
		}
		return value;
	}

	child(key: string): Reader | null {
		return Reader.object(this.errors, this.at(key), this.value[key]);
	}

	optionalChild(key: string): Reader | null {
		const value = this.value[key];
		if (value === null || value === undefined) return null;
		return this.child(key);
	}
}

const KEYS = {
	top: ['schema', 'data_status', 'status_note', 'report_id', 'report_date', 'product', 'pfs', 'scene', 'run', 'findings', 'findings_summary', 'geometric', 'radiometric', 'next_action', 'next_actions', 'scope_note'],
	product: ['explorer_id', 'name', 'short_name'],
	pfs: ['name', 'short_name', 'version', 'total_requirements'],
	scene: ['product_id', 'platform', 'instrument', 'acquisition_date', 'path', 'row', 'reference_site', 'note'],
	site: ['network', 'code', 'name'],
	run: ['code', 'snapshot', 'reviewer', 'segments', 'note'],
	segment: ['code', 'part', 'meaning'],
	finding: ['requirement', 'id', 'threshold', 'goal', 'reason'],
	geometric: ['label', 'method', 'reference', 'comparison', 'method_notes', 'pixel_size_m', 'radial_rmse_px', 'comparisons_px', 'limit_px', 'limit_source', 'matches_accepted', 'matches_total', 'positional_uncertainty', 'absolute_accuracy', 'numeric_test', 'requirement_result', 'requirement_reason'],
	radiometric: ['label', 'method', 'reference', 'comparison', 'method_notes', 'units', 'headline_band', 'headline_band_name', 'bands', 'pixels_used', 'pixels_total', 'unique_exclusions', 'product_uncertainty', 'accuracy_test', 'accuracy_reason', 'uncertainty_goal', 'uncertainty_goal_reason'],
	band: ['band', 'difference', 'uncertainty_k1']
} as const;

/** Validate a parsed report file. Throws `CqasReportError` listing every problem found. */
export function parseCqasReport(raw: unknown, source = 'report'): CqasReport {
	const errors: string[] = [];
	const r = Reader.object(errors, source, raw);
	if (!r) throw new CqasReportError(errors.join('; '));
	if (r.raw('schema') !== CQAS_SCHEMA) throw new CqasReportError(`${source}.schema must be "${CQAS_SCHEMA}"`);
	r.only(KEYS.top);

	const product = r.child('product')?.only(KEYS.product);
	const pfs = r.child('pfs')?.only(KEYS.pfs);
	const scene = r.child('scene')?.only(KEYS.scene);
	const site = scene?.optionalChild('reference_site')?.only(KEYS.site) ?? null;
	const run = r.child('run')?.only(KEYS.run);
	const geo = r.child('geometric')?.only(KEYS.geometric);
	const rad = r.child('radiometric')?.only(KEYS.radiometric);

	const explorerId = product?.text('explorer_id') ?? '';
	if (explorerId && !ID_PATTERN.test(explorerId)) errors.push(`${source}.product.explorer_id is not a stable product ID`);

	const findings: CqasFinding[] = r.list('findings', { minLength: 1 }).flatMap((item, index) => {
		const f = Reader.object(errors, `${source}.findings[${index}]`, item)?.only(KEYS.finding);
		if (!f) return [];
		return [{ requirement: f.text('requirement'), id: f.text('id'), threshold: f.oneOf('threshold', FINDING_STATUSES), goal: f.oneOf('goal', FINDING_STATUSES), reason: f.optionalText('reason') }];
	});
	const seenIds = new Set<string>();
	for (const finding of findings) {
		if (!finding.id) continue;
		if (seenIds.has(finding.id)) errors.push(`${source}.findings has a duplicate requirement id: ${finding.id}`);
		seenIds.add(finding.id);
	}

	const segments: CqasRunSegment[] = (run?.list('segments', { minLength: 1 }) ?? []).flatMap((item, index) => {
		const s = Reader.object(errors, `${source}.run.segments[${index}]`, item)?.only(KEYS.segment);
		return s ? [{ code: s.text('code'), part: s.text('part'), meaning: s.text('meaning') }] : [];
	});
	const runCode = run?.text('code') ?? '';
	if (runCode && segments.length && segments.map((segment) => segment.code).join('-') !== runCode) {
		errors.push(`${source}.run.code must equal the segment codes joined by "-"`);
	}

	const comparisons = (geo?.list('comparisons_px', { minLength: 1 }) ?? []).filter((value, index) => {
		const ok = typeof value === 'number' && Number.isFinite(value) && value >= 0;
		if (!ok) errors.push(`${source}.geometric.comparisons_px[${index}] must be a number ≥ 0`);
		return ok;
	}) as number[];

	const bands: CqasBand[] = (rad?.list('bands', { minLength: 1 }) ?? []).flatMap((item, index) => {
		const b = Reader.object(errors, `${source}.radiometric.bands[${index}]`, item)?.only(KEYS.band);
		return b ? [{ band: b.text('band'), difference: b.number('difference'), uncertainty_k1: b.number('uncertainty_k1', { min: 0 }) }] : [];
	});
	const bandNames = bands.map((band) => band.band).filter(Boolean);
	if (new Set(bandNames).size !== bandNames.length) errors.push(`${source}.radiometric.bands has duplicate band names`);
	const headlineBand = rad?.text('headline_band') ?? '';
	if (headlineBand && bands.length && !bands.some((band) => band.band === headlineBand)) errors.push(`${source}.radiometric.headline_band must name one of the bands`);

	const nextActions = r.list('next_actions').filter((value, index) => {
		const ok = typeof value === 'string' && value.trim().length > 0;
		if (!ok) errors.push(`${source}.next_actions[${index}] must be non-empty text`);
		return ok;
	}) as string[];

	if ((geo?.raw('limit_px') ?? null) !== null && (geo?.raw('limit_source') ?? null) === null) errors.push(`${source}.geometric.limit_source is required when limit_px is given`);

	const total = pfs?.number('total_requirements', { min: 1, integer: true }) ?? 0;
	if (total && findings.length > total) errors.push(`${source}.findings lists more requirements than pfs.total_requirements`);

	const matchesAccepted = geo?.number('matches_accepted', { min: 0, integer: true }) ?? 0;
	const matchesTotal = geo?.number('matches_total', { min: 0, integer: true }) ?? 0;
	if (matchesAccepted > matchesTotal) errors.push(`${source}.geometric.matches_accepted cannot exceed matches_total`);
	const pixelsUsed = rad?.number('pixels_used', { min: 0, integer: true }) ?? 0;
	const pixelsTotal = rad?.number('pixels_total', { min: 0, integer: true }) ?? 0;
	if (pixelsUsed > pixelsTotal) errors.push(`${source}.radiometric.pixels_used cannot exceed pixels_total`);

	const report: CqasReport = {
		schema: CQAS_SCHEMA,
		data_status: r.oneOf('data_status', DATA_STATUSES),
		status_note: r.text('status_note'),
		report_id: r.text('report_id'),
		report_date: r.date('report_date'),
		product: { explorer_id: explorerId, name: product?.text('name') ?? '', short_name: product?.text('short_name') ?? '' },
		pfs: { name: pfs?.text('name') ?? '', short_name: pfs?.text('short_name') ?? '', version: pfs?.text('version') ?? '', total_requirements: total },
		scene: {
			product_id: scene?.text('product_id') ?? '',
			platform: scene?.text('platform') ?? '',
			instrument: scene?.text('instrument') ?? '',
			acquisition_date: scene?.date('acquisition_date') ?? '',
			path: scene?.optionalNumber('path', { min: 0, integer: true }) ?? null,
			row: scene?.optionalNumber('row', { min: 0, integer: true }) ?? null,
			reference_site: site ? { network: site.text('network'), code: site.text('code'), name: site.text('name') } : null,
			note: scene?.optionalText('note') ?? null
		},
		run: { code: runCode, snapshot: run?.text('snapshot') ?? '', reviewer: run?.optionalText('reviewer') ?? null, segments, note: run?.optionalText('note') ?? null },
		findings,
		findings_summary: r.text('findings_summary'),
		geometric: {
			label: geo?.text('label') ?? '',
			method: geo?.text('method') ?? '',
			reference: geo?.text('reference') ?? '',
			comparison: geo?.text('comparison') ?? '',
			method_notes: geo?.optionalText('method_notes') ?? null,
			pixel_size_m: geo?.number('pixel_size_m', { positive: true }) ?? 0,
			radial_rmse_px: geo?.number('radial_rmse_px', { min: 0 }) ?? 0,
			comparisons_px: comparisons,
			limit_px: geo?.optionalNumber('limit_px', { min: 0 }) ?? null,
			limit_source: geo?.optionalText('limit_source') ?? null,
			matches_accepted: matchesAccepted,
			matches_total: matchesTotal,
			positional_uncertainty: geo?.optionalText('positional_uncertainty') ?? null,
			absolute_accuracy: geo?.oneOf('absolute_accuracy', TEST_STATUSES) ?? 'Not assessed',
			numeric_test: geo?.oneOf('numeric_test', TEST_STATUSES) ?? 'Not assessed',
			requirement_result: geo?.oneOf('requirement_result', TEST_STATUSES) ?? 'Not assessed',
			requirement_reason: geo?.optionalText('requirement_reason') ?? null
		},
		radiometric: {
			label: rad?.text('label') ?? '',
			method: rad?.text('method') ?? '',
			reference: rad?.text('reference') ?? '',
			comparison: rad?.text('comparison') ?? '',
			method_notes: rad?.optionalText('method_notes') ?? null,
			units: rad?.text('units') ?? '',
			headline_band: headlineBand,
			headline_band_name: rad?.optionalText('headline_band_name') ?? null,
			bands,
			pixels_used: pixelsUsed,
			pixels_total: pixelsTotal,
			unique_exclusions: rad?.optionalNumber('unique_exclusions', { min: 0, integer: true }) ?? null,
			product_uncertainty: rad?.optionalText('product_uncertainty') ?? null,
			accuracy_test: rad?.oneOf('accuracy_test', TEST_STATUSES) ?? 'Not assessed',
			accuracy_reason: rad?.optionalText('accuracy_reason') ?? null,
			uncertainty_goal: rad?.oneOf('uncertainty_goal', TEST_STATUSES) ?? 'Not assessed',
			uncertainty_goal_reason: rad?.optionalText('uncertainty_goal_reason') ?? null
		},
		next_action: r.text('next_action'),
		next_actions: nextActions,
		scope_note: r.text('scope_note')
	};
	if (errors.length) throw new CqasReportError(errors.join('; '));
	return report;
}

export interface CqasLoadResult {
	/** Reports keyed by Product Explorer product ID. */
	reports: Record<string, CqasReport>;
	warnings: string[];
}

/**
 * Validate every bundled report. A problem with one report never stops the explorer: an invalid
 * file, a report for an unknown product, a file not named after its product, or a second report
 * for the same product is skipped with a warning. `npm test` fails on any warning, so problems are
 * still caught before release.
 */
export function loadCqasReports(files: Record<string, unknown>, knownProductIds: Iterable<string>): CqasLoadResult {
	const known = new Set(knownProductIds);
	const reports: Record<string, CqasReport> = {};
	const warnings: string[] = [];
	for (const [path, raw] of Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
		const name = path.split('/').pop() ?? path;
		let report: CqasReport;
		try {
			report = parseCqasReport(raw, name);
		} catch (error) {
			warnings.push(`C-QAS report ${name} is invalid and is not shown: ${error instanceof Error ? error.message : 'unreadable'}`);
			continue;
		}
		const id = report.product.explorer_id;
		if (!known.has(id)) {
			warnings.push(`C-QAS report ${name} refers to unknown product ${id}; it is not shown.`);
			continue;
		}
		if (name !== `${id}.json`) {
			warnings.push(`C-QAS report ${name} must be named ${id}.json; it is not shown.`);
			continue;
		}
		if (reports[id]) {
			warnings.push(`More than one C-QAS report refers to product ${id}; ${name} is not shown.`);
			continue;
		}
		reports[id] = report;
	}
	return { reports, warnings };
}

// ---------------------------------------------------------------------------- derived values

export type FindingCounts = Record<FindingStatus, number>;

export function findingCounts(report: CqasReport, level: 'threshold' | 'goal'): FindingCounts {
	const counts: FindingCounts = { Met: 0, 'Not met': 0, 'Not assessed': 0, 'Not required': 0 };
	for (const finding of report.findings) counts[finding[level]] += 1;
	return counts;
}

/** "6 Met / 2 Not met" — the Threshold headline used on badges, comparison and summaries. */
export function thresholdHeadline(report: CqasReport): string {
	const counts = findingCounts(report, 'threshold');
	const parts = [`${counts.Met} Met`, `${counts['Not met']} Not met`];
	if (counts['Not assessed']) parts.push(`${counts['Not assessed']} Not assessed`);
	return parts.join(' / ');
}

export function geometricMetres(report: CqasReport, valuePx = report.geometric.radial_rmse_px): number {
	return valuePx * report.geometric.pixel_size_m;
}

export function headlineBand(report: CqasReport): CqasBand {
	return report.radiometric.bands.find((band) => band.band === report.radiometric.headline_band) ?? report.radiometric.bands[0]!;
}

/** Signed value with a true minus sign, e.g. +0.006 / −0.002. */
export function signed(value: number, digits = 3): string {
	const rounded = Number(value.toFixed(digits));
	const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
	return `${sign}${Math.abs(rounded).toFixed(digits)}`;
}

export function formatNumber(value: number, digits = 1): string {
	return Number(value.toFixed(digits)).toString();
}

export function dataStatusLabel(status: CqasDataStatus): string {
	return status === 'example' ? 'Concept — example data' : status === 'provisional' ? 'Provisional — not reviewed' : 'Reviewed';
}

/** True when the report PFS version differs from the product's assessed PFS version (e.g. "5.0.2" vs "v5.0"). */
export function pfsVersionDiffers(report: CqasReport, assessedVersion: string | null | undefined): boolean {
	if (!assessedVersion) return false;
	const clean = (value: string) => value.trim().replace(/^v/i, '');
	return clean(report.pfs.version) !== clean(assessedVersion);
}

/** One plain line for comparison tables and copied summaries. */
export function cqasOneLine(report: CqasReport): string {
	const band = headlineBand(report);
	return `${thresholdHeadline(report)} selected Threshold rows (${report.findings.length} of ${report.pfs.total_requirements}); geometric ${formatNumber(report.geometric.radial_rmse_px, 2)} pixel radial RMSE; radiometric ${signed(band.difference)} ${report.pfs.short_name} difference (${band.band}) for one scene`;
}
