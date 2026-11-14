/**
 * C-QAS report format ("cqas-report/2") — validation and derived values. Pure TypeScript.
 *
 * A C-QAS report describes the checks C-QAS ran for one product: PFS findings for selected
 * requirements, a geometric and (where defined) a radiometric test on one input scene, and an
 * optional series of the same test over many scenes at cal/val sites. It is separate from the
 * product's CEOS-ARD assessment and never feeds matching or ordering.
 * Field reference: docs/CQAS_REPORT_FORMAT.md.
 */

export const CQAS_SCHEMA = 'cqas-report/2';

export class CqasReportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CqasReportError';
	}
}

/** `example`: mock values (current state). `provisional`: produced by C-QAS, not reviewed. `reviewed`: reviewed output. */
export const DATA_STATUSES = ['example', 'provisional', 'reviewed'] as const;
export type CqasDataStatus = (typeof DATA_STATUSES)[number];

/** Measurement domain: decides which quantities, units and references make sense. */
export const DOMAINS = ['optical', 'thermal', 'radar'] as const;
export type CqasDomain = (typeof DOMAINS)[number];

export const FINDING_STATUSES = ['Met', 'Not met', 'Not assessed', 'Not required'] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

/** Outcomes for a single test (no "Not required"). */
export const TEST_STATUSES = ['Met', 'Not met', 'Not assessed'] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

/** `relative`: image-to-image (e.g. repeat pass). `absolute`: against surveyed ground positions (e.g. corner reflectors). */
export const GEOMETRIC_KINDS = ['relative', 'absolute'] as const;
export type GeometricKind = (typeof GEOMETRIC_KINDS)[number];

export const SERIES_TESTS = ['radiometric', 'geometric'] as const;
export type SeriesTest = (typeof SERIES_TESTS)[number];

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

export interface CqasSite {
	network: string;
	code: string;
	name: string;
}

export interface CqasChannel {
	/** Short channel code, e.g. B4, 665 nm, VV. */
	channel: string;
	/** Plain name, e.g. red, near infrared, VV polarisation. */
	name: string | null;
	/** Observed minus reference, in the radiometric units. */
	difference: number;
	/** Standard uncertainty of the comparison (k = 1). */
	uncertainty_k1: number;
	/** Reference value, when a relative (%) difference is meaningful. */
	reference_value: number | null;
}

export interface CqasGeometric {
	label: string;
	kind: GeometricKind;
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
	/** What a match is, e.g. "image matches", "corner reflectors". */
	match_unit: string;
	positional_uncertainty: string | null;
	absolute_accuracy: TestStatus;
	numeric_test: TestStatus;
	requirement_result: TestStatus;
	requirement_reason: string | null;
}

export interface CqasRadiometric {
	label: string;
	method: string;
	reference: string;
	comparison: string;
	method_notes: string | null;
	/** Plain quantity, e.g. "surface reflectance", "surface temperature", "γ⁰ backscatter". */
	quantity: string;
	/** Short label for headings and axes, e.g. SR, ST, γ⁰. */
	short_quantity: string;
	/** Units: "1" (unitless), "K" or "dB". */
	units: string;
	/** Decimal places to show. */
	decimals: number;
	headline_channel: string;
	channels: CqasChannel[];
	/** Numeric limit on the absolute difference, when one is agreed. */
	limit: number | null;
	limit_source: string | null;
	samples_used: number;
	samples_total: number;
	/** What a sample is, e.g. "pixels in the site window". */
	sample_unit: string;
	unique_exclusions: number | null;
	product_uncertainty: string | null;
	accuracy_test: TestStatus;
	accuracy_reason: string | null;
	uncertainty_goal: TestStatus;
	uncertainty_goal_reason: string | null;
}

export interface CqasSeriesPoint {
	date: string;
	/** Site code; must be listed in `sites`. */
	site: string;
	value: number;
	uncertainty_k1: number;
}

/** The same test repeated over many scenes at cal/val sites (CEOS-PVP style). */
export interface CqasSeries {
	test: SeriesTest;
	/** Plain description of what is plotted, e.g. "Red (B4) surface reflectance difference". */
	description: string;
	/** For a radiometric series, the channel plotted (one of `radiometric.channels`). */
	channel: string | null;
	units: string;
	decimals: number;
	sites: CqasSite[];
	points: CqasSeriesPoint[];
	note: string | null;
}

export interface CqasReport {
	schema: typeof CQAS_SCHEMA;
	data_status: CqasDataStatus;
	status_note: string;
	report_id: string;
	report_date: string;
	domain: CqasDomain;
	product: { explorer_id: string; name: string; short_name: string };
	pfs: { name: string; short_name: string; version: string; total_requirements: number };
	scene: {
		product_id: string;
		platform: string;
		instrument: string;
		acquisition_date: string;
		path: number | null;
		row: number | null;
		reference_site: CqasSite | null;
		note: string | null;
	};
	run: { code: string; snapshot: string; reviewer: string | null; segments: CqasRunSegment[]; note: string | null };
	/** Which requirements were checked and why, shown under the findings headline. */
	findings_scope: string;
	findings: CqasFinding[];
	findings_summary: string;
	geometric: CqasGeometric;
	/** `null` when no radiometric test is defined for this product type; `radiometric_note` says why. */
	radiometric: CqasRadiometric | null;
	radiometric_note: string | null;
	series: CqasSeries | null;
	/** Most important action for the data provider (Simple view). */
	next_action: string;
	next_actions: string[];
	scope_note: string;
}

type Json = Record<string, unknown>;

/** Radiometric units expected in each domain. */
const DOMAIN_UNITS: Record<CqasDomain, string> = { optical: '1', thermal: 'K', radar: 'dB' };

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

	number(key: string, { min = -Infinity, max = Infinity, integer = false, positive = false }: { min?: number; max?: number; integer?: boolean; positive?: boolean } = {}): number {
		const value = this.value[key];
		if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (positive && value <= 0) || (integer && !Number.isInteger(value))) {
			this.errors.push(`${this.at(key)} must be ${integer ? 'an integer' : 'a number'}${positive ? ' > 0' : min > -Infinity ? ` ≥ ${min}` : ''}${max < Infinity ? ` and ≤ ${max}` : ''}`);
			return 0;
		}
		return value;
	}

	optionalNumber(key: string, options: { min?: number; max?: number; integer?: boolean; positive?: boolean } = {}): number | null {
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
	top: ['schema', 'data_status', 'status_note', 'report_id', 'report_date', 'domain', 'product', 'pfs', 'scene', 'run', 'findings_scope', 'findings', 'findings_summary', 'geometric', 'radiometric', 'radiometric_note', 'series', 'next_action', 'next_actions', 'scope_note'],
	product: ['explorer_id', 'name', 'short_name'],
	pfs: ['name', 'short_name', 'version', 'total_requirements'],
	scene: ['product_id', 'platform', 'instrument', 'acquisition_date', 'path', 'row', 'reference_site', 'note'],
	site: ['network', 'code', 'name'],
	run: ['code', 'snapshot', 'reviewer', 'segments', 'note'],
	segment: ['code', 'part', 'meaning'],
	finding: ['requirement', 'id', 'threshold', 'goal', 'reason'],
	geometric: ['label', 'kind', 'method', 'reference', 'comparison', 'method_notes', 'pixel_size_m', 'radial_rmse_px', 'comparisons_px', 'limit_px', 'limit_source', 'matches_accepted', 'matches_total', 'match_unit', 'positional_uncertainty', 'absolute_accuracy', 'numeric_test', 'requirement_result', 'requirement_reason'],
	radiometric: ['label', 'method', 'reference', 'comparison', 'method_notes', 'quantity', 'short_quantity', 'units', 'decimals', 'headline_channel', 'channels', 'limit', 'limit_source', 'samples_used', 'samples_total', 'sample_unit', 'unique_exclusions', 'product_uncertainty', 'accuracy_test', 'accuracy_reason', 'uncertainty_goal', 'uncertainty_goal_reason'],
	channel: ['channel', 'name', 'difference', 'uncertainty_k1', 'reference_value'],
	series: ['test', 'description', 'channel', 'units', 'decimals', 'sites', 'points', 'note'],
	point: ['date', 'site', 'value', 'uncertainty_k1']
} as const;

function readSite(errors: string[], path: string, value: unknown): CqasSite | null {
	const s = Reader.object(errors, path, value)?.only(KEYS.site);
	return s ? { network: s.text('network'), code: s.text('code'), name: s.text('name') } : null;
}

function readGeometric(errors: string[], source: string, geo: Reader | null | undefined): CqasGeometric {
	const comparisons = (geo?.list('comparisons_px', { minLength: 1 }) ?? []).filter((value, index) => {
		const ok = typeof value === 'number' && Number.isFinite(value) && value >= 0;
		if (!ok) errors.push(`${source}.geometric.comparisons_px[${index}] must be a number ≥ 0`);
		return ok;
	}) as number[];
	if ((geo?.raw('limit_px') ?? null) !== null && (geo?.raw('limit_source') ?? null) === null) errors.push(`${source}.geometric.limit_source is required when limit_px is given`);
	const matchesAccepted = geo?.number('matches_accepted', { min: 0, integer: true }) ?? 0;
	const matchesTotal = geo?.number('matches_total', { min: 0, integer: true }) ?? 0;
	if (matchesAccepted > matchesTotal) errors.push(`${source}.geometric.matches_accepted cannot exceed matches_total`);
	return {
		label: geo?.text('label') ?? '',
		kind: geo?.oneOf('kind', GEOMETRIC_KINDS) ?? 'relative',
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
		match_unit: geo?.text('match_unit') ?? '',
		positional_uncertainty: geo?.optionalText('positional_uncertainty') ?? null,
		absolute_accuracy: geo?.oneOf('absolute_accuracy', TEST_STATUSES) ?? 'Not assessed',
		numeric_test: geo?.oneOf('numeric_test', TEST_STATUSES) ?? 'Not assessed',
		requirement_result: geo?.oneOf('requirement_result', TEST_STATUSES) ?? 'Not assessed',
		requirement_reason: geo?.optionalText('requirement_reason') ?? null
	};
}

function readRadiometric(errors: string[], source: string, rad: Reader): CqasRadiometric {
	const channels: CqasChannel[] = rad.list('channels', { minLength: 1 }).flatMap((item, index) => {
		const c = Reader.object(errors, `${source}.radiometric.channels[${index}]`, item)?.only(KEYS.channel);
		return c
			? [{ channel: c.text('channel'), name: c.optionalText('name'), difference: c.number('difference'), uncertainty_k1: c.number('uncertainty_k1', { min: 0 }), reference_value: c.optionalNumber('reference_value', { positive: true }) }]
			: [];
	});
	const names = channels.map((channel) => channel.channel).filter(Boolean);
	if (new Set(names).size !== names.length) errors.push(`${source}.radiometric.channels has duplicate channel names`);
	const headline = rad.text('headline_channel');
	if (headline && channels.length && !channels.some((channel) => channel.channel === headline)) errors.push(`${source}.radiometric.headline_channel must name one of the channels`);
	if ((rad.raw('limit') ?? null) !== null && (rad.raw('limit_source') ?? null) === null) errors.push(`${source}.radiometric.limit_source is required when limit is given`);
	const samplesUsed = rad.number('samples_used', { min: 0, integer: true });
	const samplesTotal = rad.number('samples_total', { min: 0, integer: true });
	if (samplesUsed > samplesTotal) errors.push(`${source}.radiometric.samples_used cannot exceed samples_total`);
	return {
		label: rad.text('label'),
		method: rad.text('method'),
		reference: rad.text('reference'),
		comparison: rad.text('comparison'),
		method_notes: rad.optionalText('method_notes'),
		quantity: rad.text('quantity'),
		short_quantity: rad.text('short_quantity'),
		units: rad.text('units'),
		decimals: rad.number('decimals', { min: 0, max: 4, integer: true }),
		headline_channel: headline,
		channels,
		limit: rad.optionalNumber('limit', { positive: true }),
		limit_source: rad.optionalText('limit_source'),
		samples_used: samplesUsed,
		samples_total: samplesTotal,
		sample_unit: rad.text('sample_unit'),
		unique_exclusions: rad.optionalNumber('unique_exclusions', { min: 0, integer: true }),
		product_uncertainty: rad.optionalText('product_uncertainty'),
		accuracy_test: rad.oneOf('accuracy_test', TEST_STATUSES),
		accuracy_reason: rad.optionalText('accuracy_reason'),
		uncertainty_goal: rad.oneOf('uncertainty_goal', TEST_STATUSES),
		uncertainty_goal_reason: rad.optionalText('uncertainty_goal_reason')
	};
}

function readSeries(errors: string[], source: string, s: Reader, radiometric: CqasRadiometric | null): CqasSeries {
	const sites = s.list('sites', { minLength: 1 }).flatMap((item, index) => {
		const site = readSite(errors, `${source}.series.sites[${index}]`, item);
		return site ? [site] : [];
	});
	const codes = new Set(sites.map((site) => site.code));
	if (codes.size !== sites.length) errors.push(`${source}.series.sites has duplicate site codes`);
	const points: CqasSeriesPoint[] = s.list('points', { minLength: 2 }).flatMap((item, index) => {
		const p = Reader.object(errors, `${source}.series.points[${index}]`, item)?.only(KEYS.point);
		if (!p) return [];
		const point = { date: p.date('date'), site: p.text('site'), value: p.number('value'), uncertainty_k1: p.number('uncertainty_k1', { min: 0 }) };
		if (point.site && !codes.has(point.site)) errors.push(`${source}.series.points[${index}].site must be one of series.sites`);
		return [point];
	});
	for (let index = 1; index < points.length; index += 1) {
		if (points[index]!.date < points[index - 1]!.date) {
			errors.push(`${source}.series.points must be in date order`);
			break;
		}
	}
	const test = s.oneOf('test', SERIES_TESTS);
	const channel = s.optionalText('channel');
	if (test === 'radiometric') {
		if (!radiometric) errors.push(`${source}.series.test cannot be radiometric when there is no radiometric test`);
		else if (!channel || !radiometric.channels.some((c) => c.channel === channel)) errors.push(`${source}.series.channel must name one of the radiometric channels`);
	} else if (channel !== null) errors.push(`${source}.series.channel must be null for a geometric series`);
	return {
		test,
		description: s.text('description'),
		channel,
		units: s.text('units'),
		decimals: s.number('decimals', { min: 0, max: 4, integer: true }),
		sites,
		points,
		note: s.optionalText('note')
	};
}

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
	const siteValue = scene?.raw('reference_site');
	const site = siteValue === null || siteValue === undefined ? null : readSite(errors, `${source}.scene.reference_site`, siteValue);
	const run = r.child('run')?.only(KEYS.run);
	const geo = r.child('geometric')?.only(KEYS.geometric);
	const radReader = r.optionalChild('radiometric')?.only(KEYS.radiometric) ?? null;

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

	const geometric = readGeometric(errors, source, geo);
	const radiometric = radReader ? readRadiometric(errors, source, radReader) : null;
	const radiometricNote = r.optionalText('radiometric_note');
	if (!radiometric && !radiometricNote) errors.push(`${source}.radiometric_note is required when radiometric is null`);
	if (radiometric && radiometricNote) errors.push(`${source}.radiometric_note must be null when there is a radiometric test`);
	const domain = r.oneOf('domain', DOMAINS);
	if (radiometric && radiometric.units && radiometric.units !== DOMAIN_UNITS[domain]) errors.push(`${source}.radiometric.units must be "${DOMAIN_UNITS[domain]}" for the ${domain} domain`);
	// The numeric test must agree with the value and the limit.
	if (geometric.limit_px === null && geometric.numeric_test !== 'Not assessed') errors.push(`${source}.geometric.numeric_test must be Not assessed when there is no limit`);
	if (geometric.limit_px !== null && geometric.numeric_test !== 'Not assessed' && (geometric.radial_rmse_px <= geometric.limit_px) !== (geometric.numeric_test === 'Met')) errors.push(`${source}.geometric.numeric_test does not agree with radial_rmse_px and limit_px`);
	const seriesReader = r.optionalChild('series')?.only(KEYS.series) ?? null;
	const series = seriesReader ? readSeries(errors, source, seriesReader, radiometric) : null;
	if (series?.test === 'radiometric' && radiometric && (series.units !== radiometric.units || series.decimals !== radiometric.decimals)) errors.push(`${source}.series units and decimals must match the radiometric test`);
	if (series?.test === 'geometric' && series.units !== 'm') errors.push(`${source}.series.units must be "m" for a geometric series`);
	const reportDate = r.date('report_date');
	const sceneDate = scene?.date('acquisition_date') ?? '';
	if (reportDate && sceneDate && sceneDate > reportDate) errors.push(`${source}.scene.acquisition_date cannot be after report_date`);
	if (reportDate && series?.points.some((point) => point.date > reportDate)) errors.push(`${source}.series.points cannot be after report_date`);

	const nextActions = r.list('next_actions').filter((value, index) => {
		const ok = typeof value === 'string' && value.trim().length > 0;
		if (!ok) errors.push(`${source}.next_actions[${index}] must be non-empty text`);
		return ok;
	}) as string[];

	const total = pfs?.number('total_requirements', { min: 1, integer: true }) ?? 0;
	if (total && findings.length > total) errors.push(`${source}.findings lists more requirements than pfs.total_requirements`);

	const report: CqasReport = {
		schema: CQAS_SCHEMA,
		data_status: r.oneOf('data_status', DATA_STATUSES),
		status_note: r.text('status_note'),
		report_id: r.text('report_id'),
		report_date: reportDate,
		domain,
		product: { explorer_id: explorerId, name: product?.text('name') ?? '', short_name: product?.text('short_name') ?? '' },
		pfs: { name: pfs?.text('name') ?? '', short_name: pfs?.text('short_name') ?? '', version: pfs?.text('version') ?? '', total_requirements: total },
		scene: {
			product_id: scene?.text('product_id') ?? '',
			platform: scene?.text('platform') ?? '',
			instrument: scene?.text('instrument') ?? '',
			acquisition_date: sceneDate,
			path: scene?.optionalNumber('path', { min: 0, integer: true }) ?? null,
			row: scene?.optionalNumber('row', { min: 0, integer: true }) ?? null,
			reference_site: site,
			note: scene?.optionalText('note') ?? null
		},
		run: { code: runCode, snapshot: run?.text('snapshot') ?? '', reviewer: run?.optionalText('reviewer') ?? null, segments, note: run?.optionalText('note') ?? null },
		findings_scope: r.text('findings_scope'),
		findings,
		findings_summary: r.text('findings_summary'),
		geometric,
		radiometric,
		radiometric_note: radiometricNote,
		series,
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

/** "6 Met / 2 Not met" — the Threshold headline used in the section, comparison and summaries. */
export function thresholdHeadline(report: CqasReport): string {
	const counts = findingCounts(report, 'threshold');
	const parts = [`${counts.Met} Met`, `${counts['Not met']} Not met`];
	if (counts['Not assessed']) parts.push(`${counts['Not assessed']} Not assessed`);
	return parts.join(' / ');
}

/** Requirements that have a Threshold level among those checked ("Not required" rows excluded). */
export function thresholdRowsChecked(report: CqasReport): number {
	return report.findings.filter((finding) => finding.threshold !== 'Not required').length;
}

export function geometricMetres(report: CqasReport, valuePx = report.geometric.radial_rmse_px): number {
	return valuePx * report.geometric.pixel_size_m;
}

/** Plain name for the geometric test, used in both views. */
export function geometricTerm(report: CqasReport): string {
	return report.geometric.kind === 'absolute' ? 'location error' : 'relative geometric error';
}

export function headlineChannel(report: CqasReport): CqasChannel | null {
	const rad = report.radiometric;
	if (!rad) return null;
	return rad.channels.find((channel) => channel.channel === rad.headline_channel) ?? rad.channels[0] ?? null;
}

/** "red (B4)" or "VV" — the channel name used in both views. */
export function channelLabel(channel: CqasChannel): string {
	return channel.name ? `${channel.name} (${channel.channel})` : channel.channel;
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

/** Unit suffix for display: unitless values ("1") have none. */
export function unitSuffix(units: string): string {
	return units === '1' ? '' : ` ${units}`;
}

/** Plain-language units, for the evidence table. */
export function unitsDescription(units: string, quantity: string): string {
	if (units === '1') return `unitless (${quantity} from 0 to 1)`;
	if (units === 'K') return 'kelvin (K)';
	if (units === 'dB') return 'decibels (dB)';
	return units;
}

/** A signed difference with units, at the report's precision: "+0.006", "+0.62 K", "−0.14 dB". */
export function radValue(rad: Pick<CqasRadiometric, 'units' | 'decimals'>, value: number): string {
	return `${signed(value, rad.decimals)}${unitSuffix(rad.units)}`;
}

export function radUncertainty(rad: Pick<CqasRadiometric, 'units' | 'decimals'>, value: number): string {
	return `±${value.toFixed(rad.decimals)}${unitSuffix(rad.units)}`;
}

/** Difference as a percentage of the reference value, when the report gives one. */
export function relativePercent(channel: CqasChannel): number | null {
	return channel.reference_value ? (channel.difference / channel.reference_value) * 100 : null;
}

export function dataStatusLabel(status: CqasDataStatus): string {
	return status === 'example' ? 'Example data' : status === 'provisional' ? 'Provisional — not reviewed' : 'Reviewed';
}

/** True when the report PFS version differs from the product's assessed PFS version (e.g. "5.0.2" vs "v5.0"). */
export function pfsVersionDiffers(report: CqasReport, assessedVersion: string | null | undefined): boolean {
	if (!assessedVersion) return false;
	const clean = (value: string) => value.trim().replace(/^v/i, '');
	return clean(report.pfs.version) !== clean(assessedVersion);
}

export interface SeriesStats {
	scenes: number;
	sites: number;
	start: string;
	end: string;
	mean: number;
	/** Sample standard deviation (spread between scenes). */
	sd: number;
	/** Scenes whose difference is within their own k = 2 uncertainty of zero. */
	withinK2: number;
}

export function seriesStats(series: CqasSeries, site: string | null = null): SeriesStats | null {
	const points = site ? series.points.filter((point) => point.site === site) : series.points;
	if (!points.length) return null;
	const mean = points.reduce((sum, point) => sum + point.value, 0) / points.length;
	const sd = points.length > 1 ? Math.sqrt(points.reduce((sum, point) => sum + (point.value - mean) ** 2, 0) / (points.length - 1)) : 0;
	return {
		scenes: points.length,
		sites: new Set(points.map((point) => point.site)).size,
		start: points[0]!.date,
		end: points[points.length - 1]!.date,
		mean,
		sd,
		withinK2: points.filter((point) => Math.abs(point.value) <= 2 * point.uncertainty_k1).length
	};
}

/** A series value with units: signed for a radiometric difference, unsigned for a geometric error. */
export function seriesValue(series: Pick<CqasSeries, 'test' | 'units' | 'decimals'>, value: number): string {
	return series.test === 'geometric' ? `${value.toFixed(series.decimals)}${unitSuffix(series.units)}` : `${signed(value, series.decimals)}${unitSuffix(series.units)}`;
}

export function seriesUncertainty(series: Pick<CqasSeries, 'units' | 'decimals'>, value: number): string {
	return `±${value.toFixed(series.decimals)}${unitSuffix(series.units)}`;
}

/** What a sample can be excluded for, in plain words. */
export function exclusionExamples(domain: CqasDomain): string {
	return domain === 'radar' ? 'for example low signal-to-clutter or an obstructed reflector' : domain === 'thermal' ? 'for example cloud or mixed land and water' : 'for example cloud, shadow or saturation';
}

/** Status, PFS and report identity for comparison details and summaries. */
export function cqasProvenance(report: CqasReport): string {
	return `${dataStatusLabel(report.data_status)} · PFS ${report.pfs.short_name} v${report.pfs.version} · report ${report.report_id} (${report.report_date})`;
}

/** Three short lines (findings, geometric, radiometric or series) for the comparison table. */
export function cqasLines(report: CqasReport): string[] {
	const g = report.geometric;
	const lines = [
		`PFS: ${thresholdHeadline(report)} (${report.findings.length} of ${report.pfs.total_requirements} requirements checked)`,
		`Geometric: ${formatNumber(geometricMetres(report))} m ${geometricTerm(report)} (${formatNumber(g.radial_rmse_px, 2)} pixel)`
	];
	const rad = report.radiometric;
	const channel = headlineChannel(report);
	const stats = report.series ? seriesStats(report.series) : null;
	if (report.series && stats && report.series.test === 'radiometric' && rad) {
		lines.push(`Radiometric: mean ${seriesValue(report.series, stats.mean)} ${rad.short_quantity} difference, ${report.series.channel}, over ${stats.scenes} scenes at ${stats.sites} site${stats.sites === 1 ? '' : 's'}`);
	} else if (rad && channel) {
		lines.push(`Radiometric: ${radValue(rad, channel.difference)} ${rad.short_quantity} difference, ${channel.channel}, one scene`);
	} else {
		lines.push('Radiometric: no test defined for this product type');
	}
	return lines;
}

/** One plain line for copied summaries. */
export function cqasOneLine(report: CqasReport): string {
	return cqasLines(report).join('; ');
}

/** Compact form sent to every page (the full report is loaded on the product page only). */
export interface CqasSummary {
	data_status: CqasDataStatus;
	lines: string[];
	provenance: string;
}

export function cqasSummary(report: CqasReport): CqasSummary {
	return { data_status: report.data_status, lines: cqasLines(report), provenance: cqasProvenance(report) };
}
