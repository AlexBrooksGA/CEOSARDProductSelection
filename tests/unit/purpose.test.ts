import { describe, expect, it } from 'vitest';
import { buildComparison } from '../../src/lib/domain/comparison';
import { matchingCriteria, NEUTRAL_STATE, type ExplorerState } from '../../src/lib/domain/explorer';
import { previewProfile } from '../../src/lib/domain/profiles';
import {
	answersFromKey,
	checkActions,
	contextLines,
	EMPTY_ANSWERS,
	EXPERIENCE_DISCLOSURE,
	GuidanceError,
	guidanceStatus,
	loadGuidance,
	outputNote,
	parsePurposeKey,
	proposePurpose,
	purposeKey,
	purposeSentence,
	qualitativeNotes,
	questionsFor,
	resolveChecks,
	sameSettings,
	sanitiseAnswers,
	timeframeRange,
	currentJourneySettings,
	visualState,
	type PurposeAnswers
} from '../../src/lib/domain/purpose';
import { buildSelectionSummary } from '../../src/lib/domain/summary';
import type { Product, Profile } from '../../src/lib/domain/types';
import { emptySession, validateSession } from '../../src/lib/state/session';
import { hasMeaningfulState, parseUrlState, queryString } from '../../src/lib/state/url';
import { parity, readJson } from './fixtures';

const g = loadGuidance(readJson('data/purpose_guidance.json'));
const catalogue: Product[] = parity('catalogue_normalised.json');
const byId = Object.fromEntries(catalogue.map((p) => [p.id, p]));
const state = (patch: Partial<ExplorerState> = {}): ExplorerState => ({ ...structuredClone(NEUTRAL_STATE), ...patch });
const answers = (patch: Partial<PurposeAnswers> = {}): PurposeAnswers => ({ ...structuredClone(EMPTY_ANSWERS), ...patch });
const wetlands = answers({ goal: 'monitor-change', context: 'wetlands', question: 'seasonal-inundation', detail: 'small', frequency: 'seasonal', measurement: 'decide' });

describe('guidance file', () => {
	it('is valid, versioned, honest about review status and cites real sources', () => {
		expect(g.version).toBe('1');
		expect(g.mapping_version).toBe(1);
		expect(g.status).toBe('illustrative');
		expect(g.review.reviewed).toBe(false);
		expect(g.sources.every((s) => s.url.startsWith('https://'))).toBe(true);
		for (const entry of g.guidance) for (const check of entry.checks) expect(check.why.length).toBeGreaterThan(20);
	});
	it('rejects malformed guidance', () => {
		const bad = structuredClone(readJson<any>('data/purpose_guidance.json'));
		bad.guidance[0].checks[0].sources = ['unknown-source'];
		expect(() => loadGuidance(bad)).toThrow(GuidanceError);
		expect(() => loadGuidance({ schema: 2 })).toThrow(GuidanceError);
	});
});

describe('answers, wording and keys', () => {
	it('offers questions appropriate to the goal and context, always with custom and not-sure routes', () => {
		const ids = questionsFor(g, 'monitor-change', 'wetlands').map((q) => q.id);
		expect(ids).toContain('seasonal-inundation');
		expect(ids).toContain('custom');
		expect(ids).toContain('unsure');
		expect(questionsFor(g, 'map-features', 'urban').map((q) => q.id)).not.toContain('seasonal-inundation');
		expect(g.goals.some((goal) => goal.id === 'custom')).toBe(true);
	});

	it('builds a readable sentence and keeps private text out of shared wording', () => {
		expect(purposeSentence(wetlands, g)).toBe('I want to monitor change in wetlands, to understand seasonal changes in inundation.');
		const custom = answers({ goal: 'custom', goalText: 'track mangrove dieback', context: 'custom', contextText: 'Kakadu', question: 'unsure' });
		expect(purposeSentence(custom, g)).toBe('I want to track mangrove dieback in Kakadu.');
		expect(purposeSentence(custom, g, { includePrivate: false })).toBe('I want to do something else in another setting.');
	});

	it('round-trips a public key built only from fixed ids', () => {
		expect(purposeKey(wetlands)).toBe('monitor-change~wetlands~seasonal-inundation');
		expect(parsePurposeKey('monitor-change~wetlands~seasonal-inundation', g)).toEqual({ goal: 'monitor-change', context: 'wetlands', question: 'seasonal-inundation' });
		expect(parsePurposeKey('monitor-change~atlantis~-', g)).toBeNull();
		expect(purposeKey(answers())).toBeNull();
		expect(answersFromKey(parsePurposeKey('map-features~-~-', g)!).area).toBe('');
	});

	it('drops unknown or inconsistent session answers', () => {
		const clean = sanitiseAnswers({ goal: 'map-features', context: 'urban', question: 'seasonal-inundation', measurement: 'lidar', area: 'x'.repeat(500), resolution: { mode: 'required', value: -5 } }, g);
		expect(clean.question).toBeNull();
		expect(clean.measurement).toBeNull();
		expect(clean.area).toHaveLength(160);
		expect(clean.resolution).toBeNull();
	});
});

describe('mapping v1: proposal is explicit and invents no thresholds', () => {
	it('qualitative answers create notes and checks, never numeric criteria or a family', () => {
		const proposal = proposePurpose(wetlands, g, state());
		expect(proposal.next.family).toBe('All product families');
		expect(proposal.next.criteria).toEqual({});
		expect(proposal.proposed.every((p) => p.reason.length > 0 && p.mode.length > 0)).toBe(true);
		expect(proposal.notes.join(' ')).toContain('No resolution limit is set automatically');
		expect(proposal.notes.join(' ')).toContain('No revisit limit is set automatically');
		expect(proposal.next.purpose).toBe('monitor-change~wetlands~seasonal-inundation');
		expect(proposal.next.guidanceVersion).toBe('1');
		const checks = resolveChecks(g, wetlands).map((c) => c.id);
		expect(checks).toEqual(expect.arrayContaining(['area-period', 'quality-indicators', 'suitability', 'consistency', 'record-period', 'seasonal-observations', 'cloud', 'water-under-vegetation', 'smallest-wetland', 'validation']));
		expect(outputNote(g, wetlands)).toContain('does not perform them');
		expect(guidanceStatus(g, wetlands).status).toBe('illustrative');
	});

	it('a single chosen measurement sets the family filter; checks follow the measurement', () => {
		const sar = { ...wetlands, measurement: 'sar' };
		expect(proposePurpose(sar, g, state()).next.family).toBe('Synthetic Aperture Radar');
		expect(resolveChecks(g, sar).map((c) => c.id)).not.toContain('cloud');
		expect(proposePurpose({ ...wetlands, measurement: 'optical-radar' }, g, state()).next.family).toBe('All product families');
	});

	it('numeric criteria come only from typed values with the chosen mode', () => {
		const typed = { ...wetlands, resolution: { mode: 'required' as const, value: 30 }, revisit: { mode: 'preferred' as const, value: 12 } };
		const proposal = proposePurpose(typed, g, state());
		expect(proposal.next.criteria).toEqual({ spatial_resolution_m: { mode: 'required', value: 30 }, revisit_days: { mode: 'preferred', value: 12 } });
		expect(proposal.proposed.find((p) => p.label === 'Spatial resolution')?.reason).toBe('You entered this value.');
	});

	it('retains independent constraints and selections, and shows a diff', () => {
		const current = state({ search: 'sentinel', scope: 'All statuses', family: 'Surface Temperature', criteria: { radiometric_bit_depth: { mode: 'preferred', value: 12 }, revisit_days: { mode: 'required', value: 5 } }, shortlist: ['a', 'b', 'c', 'd'], compare: ['a', 'b'] });
		const proposal = proposePurpose(wetlands, g, current);
		expect(proposal.next.search).toBe('sentinel');
		expect(proposal.next.scope).toBe('All statuses');
		expect(proposal.next.shortlist).toEqual(['a', 'b', 'c', 'd']);
		expect(proposal.next.criteria).toEqual({ radiometric_bit_depth: { mode: 'preferred', value: 12 } });
		expect(proposal.changes.map((c) => c.label)).toEqual(['Measurement family', 'Nominal revisit']);
		expect(proposal.retained.join(' ')).toMatch(/Search “sentinel”.*Radiometric bit depth.*Shortlist \(4\)/);
	});

	it('detects manual adjustment after applying without re-applying anything', () => {
		const proposal = proposePurpose(wetlands, g, state());
		expect(sameSettings(proposal.settings, currentJourneySettings(proposal.next))).toBe(true);
		const edited = { ...proposal.next, criteria: { revisit_days: { mode: 'required' as const, value: 16 } } };
		expect(sameSettings(proposal.settings, currentJourneySettings(edited))).toBe(false);
	});

	it('does not alter built-in profiles (Monitor Change still requires 5-day revisit when applied)', () => {
		const profiles: Profile[] = parity('profiles_normalised.json');
		const monitor = profiles.find((p) => p.id === 'monitor-change')!;
		expect(previewProfile(state(), monitor).next.criteria.revisit_days).toEqual({ mode: 'required', value: 5 });
	});

	it('notes area and period are context only', () => {
		expect(qualitativeNotes(answers({ area: 'Macquarie Marshes' })).join(' ')).toContain('does not search, map or check acquisitions');
	});

	it('maps answers to qualitative imagery states only', () => {
		expect(visualState(answers(), g)).toEqual({ family: 'neutral', detail: 'fine' });
		expect(visualState(answers({ measurement: 'sar', detail: 'broad' }), g)).toEqual({ family: 'radar', detail: 'coarse' });
		expect(visualState(answers({ measurement: 'optical-radar' }), g).family).toBe('neutral');
	});

	it('gives next actions from existing product links', () => {
		const check = resolveChecks(g, wetlands).find((c) => c.id === 'seasonal-observations')!;
		const actions = checkActions(check, byId['sentinel2-level2a']!, g, '/products/sentinel2-level2a');
		expect(actions[0]!.url).toBe(byId['sentinel2-level2a']!.access_url);
		const validation = resolveChecks(g, wetlands).find((c) => c.id === 'validation')!;
		expect(checkActions(validation, null, g)[0]!.url).toContain('ramsar.org');
	});
});

describe('URL and session extensions', () => {
	it('round-trips the public purpose key and version; private text never enters the URL', () => {
		const s = proposePurpose({ ...wetlands, area: 'Secret Swamp', goalText: 'private' }, g, state()).next;
		const query = queryString(s);
		expect(query).toContain('pu=monitor-change%7Ewetlands%7Eseasonal-inundation');
		expect(query).toContain('gv=1');
		expect(query).not.toMatch(/Secret|private/);
		expect(parseUrlState(new URLSearchParams(query)).state.purpose).toBe('monitor-change~wetlands~seasonal-inundation');
	});
	it('treats a bare version parameter as not meaningful', () => {
		expect(hasMeaningfulState(parseUrlState(new URLSearchParams('v=1')))).toBe(false);
		expect(hasMeaningfulState(parseUrlState(new URLSearchParams('')))).toBe(false);
		expect(hasMeaningfulState(parseUrlState(new URLSearchParams('v=1&scope=assessed')))).toBe(false);
		expect(hasMeaningfulState(parseUrlState(new URLSearchParams('v=1&sl=landsat-c2-sr')))).toBe(true);
		expect(hasMeaningfulState(parseUrlState(new URLSearchParams('v=1&pu=explore')))).toBe(true);
	});
	it('rejects malformed purpose keys but keeps the criteria', () => {
		const parsed = parseUrlState(new URLSearchParams('v=1&pu=<script>&rev=req:5'));
		expect(parsed.state.purpose).toBeNull();
		expect(parsed.state.criteria.revisit_days).toEqual({ mode: 'required', value: 5 });
		expect(parsed.issues.join(' ')).toContain('purpose in this link was not recognised');
	});
	it('validates stored purpose state and check outcomes', () => {
		const data = emptySession();
		const result = validateSession({
			...data,
			purpose: {
				draft: { goal: 'monitor-change' },
				applied: { answers: wetlands, key: 'monitor-change~wetlands~seasonal-inundation', guidanceVersion: '1', mappingVersion: 1, appliedAt: 'x', settings: { family: 'All product families', spatial_resolution_m: null, revisit_days: { mode: 'bogus', value: 3 } } },
				skipped: true,
				checks: { 'landsat-c2-sr': { cloud: { outcome: 'concern', note: 'wet season cloudy' }, 'Bad Id': { outcome: 'supports' } }, 'bad id': {} }
			}
		});
		expect(result.data.purpose.skipped).toBe(true);
		expect(result.data.purpose.applied?.settings.revisit_days).toBeNull();
		expect(result.data.purpose.checks).toEqual({ 'landsat-c2-sr': { cloud: { outcome: 'concern', note: 'wet season cloudy', purpose: null } } });
	});
});

describe('purpose carried into comparison and summary', () => {
	const pair = [byId['landsat-c2-sr']!, byId['ga-sentinel1-nrb']!];
	const checks = resolveChecks(g, wetlands);
	const outcome = (productId: string, checkId: string) => (productId === 'landsat-c2-sr' && checkId === 'cloud' ? { outcome: 'concern' as const, note: 'Wet season is cloudy' } : null);

	it('puts requirements and purpose checks first, keeping assessment and quality separate', () => {
		const groups = buildComparison(pair, matchingCriteria(state()), [], {}, {
			sentence: purposeSentence(wetlands, g),
			statusLabel: guidanceStatus(g, wetlands).label,
			outputNote: outputNote(g, wetlands),
			guidance: g,
			answers: wetlands,
			checks,
			outcome,
			detailHref: (p) => `/products/${p.id}`
		});
		expect(groups.map((group) => group.id)).toEqual(['requirements', 'spatial-temporal', 'assessment', 'quality', 'access']);
		const rows = Object.fromEntries(groups[0]!.rows.map((r) => [r.id, r]));
		expect(rows['purpose-measurement']!.cells[1]!.text).toContain('Radar can observe through cloud');
		expect(rows['check-cloud']!.cells.map((c) => c.text)).toEqual(['Your record: Checked — concern', 'Manual check — open']);
		expect(rows['check-cloud']!.cells[0]!.detail).toContain('Your note');
		expect(groups[0]!.description).toContain('Illustrative guidance');
	});

	it('copied summary carries purpose, guidance version/status, assumptions, outcomes and next actions', () => {
		const s = proposePurpose(wetlands, g, state({ shortlist: ['landsat-c2-sr'] })).next;
		const text = buildSelectionSummary({
			snapshot: new Date('2026-10-09T00:00:00Z'),
			shareUrl: 'https://example.test/shortlist',
			state: s,
			products: byId,
			notes: {},
			investigationNote: '',
			currentFingerprint: '',
			provenance: {},
			unresolvedReason: () => '',
			purpose: {
				sentence: purposeSentence(wetlands, g),
				statusLabel: guidanceStatus(g, wetlands).label,
				guidance: g,
				source: 'session',
				output: 'a series of maps over time',
				area: 'Macquarie Marshes',
				period: '2019–2024',
				assumptions: ['Satellite products are inputs.'],
				notes: [],
				outputNote: outputNote(g, wetlands),
				checks,
				outcome,
				adjusted: true
			}
		});
		for (const expected of ['not a CEOS suitability assessment', 'seasonal changes in inundation', 'guidance version 1, mapping version 1', 'Illustrative guidance', 'Macquarie Marshes', 'Filters were adjusted', 'Ramsar', 'Cloud-free optical observations in your wet season — Checked — concern (Wet season is cloudy)', 'next: Check acquisitions in the provider portal: https://earthexplorer.usgs.gov/']) {
			expect(text).toContain(expected);
		}
	});
});

describe('experience, region and period', () => {
	it('offers continent regions with icons and simple period ranges', () => {
		expect(g.regions.map((r) => r.id)).toEqual(['global', 'africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania', 'antarctica', 'custom']);
		expect(g.timeframes.map((t) => t.id)).toEqual(['past-year', 'past-5', 'past-10', 'past-20', 'ongoing', 'custom']);
		expect(timeframeRange(g.timeframes.find((t) => t.id === 'past-10')!, new Date('2026-10-09'))).toBe('2016–2026');
		expect(timeframeRange(g.timeframes.find((t) => t.id === 'ongoing')!)).toBeNull();
		expect(() => loadGuidance({ ...structuredClone(g), regions: [{ id: 'mars', label: 'Mars', icon: 'MARS' }] })).toThrow(GuidanceError);
	});

	it('words region and period readably, only when private details are included', () => {
		const a = answers({ goal: 'map-features', region: 'africa', timeframe: 'past-10' });
		expect(purposeSentence(a, g)).toBe('I want to map features, across Africa over the past decade.');
		expect(purposeSentence(a, g, { includePrivate: false })).toBe('I want to map features.');
		const typed = answers({ goal: 'map-features', region: 'custom', area: 'Kakadu', timeframe: 'custom', period: '2019–2024' });
		expect(purposeSentence(typed, g)).toBe('I want to map features, in Kakadu during 2019–2024.');
		expect(contextLines(a, g, new Date('2026-10-09'))).toEqual({ area: 'Africa', period: 'the past decade (2016–2026)' });
	});

	it('never puts experience, region or period in the public key or filters', () => {
		const a = answers({ ...wetlands, experience: 'specialist', region: 'oceania', timeframe: 'past-5' });
		expect(purposeKey(a)).toBe('monitor-change~wetlands~seasonal-inundation');
		const next = proposePurpose(a, g, state()).next;
		expect(queryString(next)).not.toMatch(/specialist|oceania|past/);
		expect(proposePurpose(a, g, state()).settings).toEqual(proposePurpose(wetlands, g, state()).settings);
	});

	it('validates stored choices and migrates typed area and period from earlier sessions', () => {
		const clean = sanitiseAnswers({ goal: 'map-features', experience: 'guru', region: 'atlantis', timeframe: 'past-5' }, g);
		expect(clean).toMatchObject({ experience: null, region: null, timeframe: 'past-5' });
		const old = sanitiseAnswers({ goal: 'map-features', area: 'Macquarie Marshes', period: '2019–2024' }, g);
		expect(old).toMatchObject({ region: 'custom', area: 'Macquarie Marshes', timeframe: 'custom', period: '2019–2024' });
		// Typed text is dropped when a fixed choice replaces it.
		expect(sanitiseAnswers({ goal: 'map-features', region: 'asia', area: 'leftover' }, g).area).toBe('');
	});

	it('changes only disclosure defaults by experience', () => {
		expect(EXPERIENCE_DISCLOSURE.specialist['more-filters']).toBe(true);
		expect(EXPERIENCE_DISCLOSURE.new['family-help']).toBe(true);
		expect(EXPERIENCE_DISCLOSURE.new['more-filters']).toBe(false);
		expect(EXPERIENCE_DISCLOSURE.familiar).toEqual({});
	});
});

describe('depth scene geometry', async () => {
	const { coverTransform, pickWidth, LANDSCAPE_WIDTHS } = await import('../../src/lib/components/purpose/depth-scene');
	it('picks the smallest image that covers the drawing buffer', () => {
		expect(pickWidth(1100)).toBe(1280);
		expect(pickWidth(1700)).toBe(1920);
		expect(pickWidth(2160)).toBe(2560);
		expect(pickWidth(5000)).toBe(LANDSCAPE_WIDTHS.at(-1));
	});
	it('covers any window without stretching and keeps the subject in narrow windows', () => {
		const wide = coverTransform(2400, 900);
		expect(wide.scale[0]).toBeCloseTo(1 / 1.07);
		expect(wide.scale[1]).toBeLessThan(wide.scale[0]);
		const narrow = coverTransform(800, 1000);
		expect(narrow.scale[1]).toBeCloseTo(1 / 1.07);
		expect(narrow.focus[0]).toBeCloseTo(0.64);
		expect(narrow.focus[0] + narrow.scale[0] / 2).toBeLessThanOrEqual(1);
		const extreme = coverTransform(300, 1000);
		expect(extreme.focus[0] - extreme.scale[0] / 2).toBeGreaterThanOrEqual(0);
	});
});
