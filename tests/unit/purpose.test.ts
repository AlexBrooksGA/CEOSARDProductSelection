import { describe, expect, it } from 'vitest';
import { buildComparison } from '../../src/lib/domain/comparison';
import { matchingCriteria, NEUTRAL_STATE, toFilterState, type ExplorerState } from '../../src/lib/domain/explorer';
import { metadataFilter, OPTICAL_AND_RADAR } from '../../src/lib/domain/filters';
import { groupAndSort, GROUP_STRONG } from '../../src/lib/domain/matching';
import { previewProfile } from '../../src/lib/domain/profiles';
import {
	answersFromKey,
	checkActions,
	contextLines,
	EMPTY_ANSWERS,
	EXPERIENCE_DISCLOSURE,
	familyFor,
	GuidanceError,
	guidanceStatus,
	hasPurpose,
	loadGuidance,
	needsFor,
	outputNote,
	parsePurposeKey,
	proposePurpose,
	purposeKey,
	purposeSentence,
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
/** The worked example from the review: wetland water, tracked through time, continental, since 2015. */
const wetlands = answers({ theme: 'water', need: 'water', use: 'change', region: 'continent', timeframe: 'since-2015', detail: 'field', frequency: 'seasonal' });

describe('guidance file', () => {
	it('is valid, versioned, honest about review status and cites real sources', () => {
		expect(g.version).toBe('2');
		expect(g.mapping_version).toBe(2);
		expect(g.status).toBe('illustrative');
		expect(g.review.reviewed).toBe(false);
		expect(g.sources.every((s) => s.url.startsWith('https://'))).toBe(true);
		expect(g.sources.map((s) => s.id)).toEqual(expect.arrayContaining(['ceos-ard-strategy-2026', 'wgcv56-lsivc19', 'ceos-work-plan']));
		for (const entry of g.guidance) for (const check of entry.checks) expect(check.why.length).toBeGreaterThan(20);
	});
	it('ties every theme except "something else" to a CEOS home', () => {
		for (const theme of g.themes.filter((t) => t.id !== 'custom')) expect(theme.hint).toMatch(/CEOS|GEO|COAST-VC/);
	});
	it('rejects malformed guidance', () => {
		const bad = structuredClone(readJson<any>('data/purpose_guidance.json'));
		bad.guidance[0].checks[0].sources = ['unknown-source'];
		expect(() => loadGuidance(bad)).toThrow(GuidanceError);
		expect(() => loadGuidance({ schema: 1 })).toThrow(GuidanceError);
		const badNeed = structuredClone(readJson<any>('data/purpose_guidance.json'));
		badNeed.needs[0].families = ['sr', 'st'];
		expect(() => loadGuidance(badNeed)).toThrow(/cannot filter together/);
		const badBand = structuredClone(readJson<any>('data/purpose_guidance.json'));
		badBand.details[0].resolution_m = -1;
		expect(() => loadGuidance(badBand)).toThrow(GuidanceError);
		const badCoverage = structuredClone(readJson<any>('data/purpose_guidance.json'));
		badCoverage.regions[0].coverage = 'Planetary';
		expect(() => loadGuidance(badCoverage)).toThrow(GuidanceError);
	});
});

describe('answers, wording and keys', () => {
	it('shortens the needs to fit the theme, always with a not-sure route', () => {
		const water = needsFor(g, 'water').map((n) => n.id);
		expect(water).toEqual(expect.arrayContaining(['water', 'water-colour', 'unsure']));
		expect(water).not.toContain('movement');
		expect(needsFor(g, 'cities').map((n) => n.id)).toContain('movement');
		expect(needsFor(g, 'custom')).toHaveLength(g.needs.length);
		expect(needsFor(g, null)).toHaveLength(g.needs.length);
	});

	it('needs a theme and a need before proposing a setup', () => {
		expect(hasPurpose(answers({ theme: 'water' }))).toBe(false);
		expect(hasPurpose(answers({ theme: 'water', need: 'water' }))).toBe(true);
		expect(hasPurpose(answers({ theme: 'custom', need: 'unsure' }))).toBe(false);
		expect(hasPurpose(answers({ theme: 'custom', themeText: 'mangroves', need: 'unsure' }))).toBe(true);
	});

	it('builds a readable sentence and keeps private text out of shared wording', () => {
		expect(purposeSentence(wetlands, g)).toBe('My work is about water and wetlands, needing to see surface water and flooding, to track change through time, across a continent or region since about 2015.');
		expect(purposeSentence(wetlands, g, { includePrivate: false })).toBe('My work is about water and wetlands, needing to see surface water and flooding, to track change through time.');
		const custom = answers({ theme: 'custom', themeText: 'mangrove dieback', need: 'unsure' });
		expect(purposeSentence(custom, g)).toBe('My work is about mangrove dieback.');
		expect(purposeSentence(custom, g, { includePrivate: false })).toBe('My work is about another topic.');
	});

	it('round-trips a public key built only from fixed ids', () => {
		expect(purposeKey(wetlands)).toBe('water~water~change');
		expect(parsePurposeKey('water~water~change', g)).toEqual({ theme: 'water', need: 'water', use: 'change' });
		expect(parsePurposeKey('water~lidar~-', g)).toBeNull();
		expect(parsePurposeKey('monitor-change~wetlands~seasonal-inundation', g)).toBeNull();
		expect(purposeKey(answers())).toBeNull();
		expect(answersFromKey(parsePurposeKey('cities~-~-', g)!)).toMatchObject({ theme: 'cities', need: null, notes: '' });
	});

	it('drops unknown or inconsistent session answers', () => {
		const clean = sanitiseAnswers({ theme: 'water', need: 'movement', use: 'teleport', notes: 'x'.repeat(900), period: 'kept?', resolution: { mode: 'required', value: -5 } }, g);
		expect(clean.need).toBeNull();
		expect(clean.use).toBeNull();
		expect(clean.notes).toHaveLength(400);
		expect(clean.period).toBe('');
		expect(clean.resolution).toBeNull();
		// Sessions from mapping v1 (goal/context/question) give empty answers rather than wrong ones.
		expect(sanitiseAnswers({ goal: 'monitor-change', context: 'wetlands', measurement: 'sar' }, g)).toMatchObject({ theme: null, need: null });
	});
});

describe('mapping v2: the need filters; other answers order or add checks', () => {
	it('maps needs to the family filter, keeping two families together where both serve', () => {
		expect(familyFor([])).toBe('All product families');
		expect(familyFor(['sar', 'sr'])).toBe(OPTICAL_AND_RADAR);
		expect(familyFor(['st'])).toBe('Surface Temperature');
		expect(familyFor(['sr', 'st'])).toBeNull();
		const family = (need: string) => proposePurpose(answers({ theme: 'disasters', need }), g, state()).next.family;
		expect(family('water')).toBe(OPTICAL_AND_RADAR);
		expect(family('movement')).toBe('Synthetic Aperture Radar');
		expect(family('temperature')).toBe('Surface Temperature');
		expect(family('unsure')).toBe('All product families');
	});

	it('the worked example: 22 optical and radar products, ordered by coverage and resolution, 11 checks', () => {
		const proposal = proposePurpose(wetlands, g, state());
		expect(proposal.next.criteria).toEqual({
			geographic_coverage: { mode: 'preferred', value: 'Continental or multi-country' },
			spatial_resolution_m: { mode: 'preferred', value: 30 }
		});
		expect(proposal.preferences).toBe(2);
		expect(proposal.next.purpose).toBe('water~water~change');
		expect(proposal.next.guidanceVersion).toBe('2');
		const shown = metadataFilter(catalogue, toFilterState(proposal.next));
		expect(shown).toHaveLength(22);
		expect(new Set(shown.map((p) => p.product_family))).toEqual(new Set(['Surface Reflectance', 'Synthetic Aperture Radar']));
		const strong = groupAndSort(shown, { criteria: matchingCriteria(proposal.next) })[GROUP_STRONG]!.map((r) => r.product.id);
		expect(strong).toEqual(expect.arrayContaining(['landsat-c2-sr', 'sentinel2-level2a', 'opera-rtc-sentinel1', 'dea-sentinel1-rtc', 'alos2-palsar2-global-mosaics-rtc']));
		const checks = resolveChecks(g, wetlands).map((c) => c.id);
		expect(checks).toHaveLength(11);
		expect(checks).toEqual(expect.arrayContaining(['area-period', 'quality-indicators', 'suitability', 'record-period', 'consistency', 'stability', 'seasonal-observations', 'cloud', 'water-under-vegetation', 'smallest-wetland', 'validation']));
		// Theme-specific checks replace their general counterparts.
		expect(checks).not.toContain('smallest-feature');
		expect(checks).not.toContain('usable-observations');
		expect(outputNote(g, wetlands)).toContain('does not perform them');
		expect(guidanceStatus(g, wetlands).status).toBe('illustrative');
	});

	it('every reason says where a setting came from, and Preferred is described as ordering', () => {
		const proposal = proposePurpose(wetlands, g, state());
		expect(proposal.proposed.map((p) => p.label)).toEqual(['Measurement family', 'Reported coverage', 'Spatial resolution', 'Nominal revisit']);
		expect(proposal.proposed.every((p) => p.reason.length > 0 && p.mode.length > 0)).toBe(true);
		expect(proposal.proposed[1]!.reason).toContain('never hides a product');
		expect(proposal.proposed[3]!.reason).toContain('check on usable observations');
	});

	it('frequency bands set revisit only for the first two options; a site sets no coverage', () => {
		const a = (frequency: string, region = 'site') => proposePurpose(answers({ theme: 'agriculture', need: 'vegetation', frequency, region }), g, state()).next.criteria;
		expect(a('days').revisit_days).toEqual({ mode: 'preferred', value: 5 });
		expect(a('weeks').revisit_days).toEqual({ mode: 'preferred', value: 16 });
		expect(a('seasonal').revisit_days).toBeUndefined();
		expect(a('days').geographic_coverage).toBeUndefined();
		expect(a('days', 'global').geographic_coverage).toEqual({ mode: 'preferred', value: 'Global' });
	});

	it('typed technical limits replace the band, with the mode the user chose', () => {
		const typed = { ...wetlands, resolution: { mode: 'required' as const, value: 10 }, revisit: { mode: 'preferred' as const, value: 12 } };
		const proposal = proposePurpose(typed, g, state());
		expect(proposal.next.criteria.spatial_resolution_m).toEqual({ mode: 'required', value: 10 });
		expect(proposal.next.criteria.revisit_days).toEqual({ mode: 'preferred', value: 12 });
		expect(proposal.proposed.find((p) => p.label === 'Spatial resolution')?.reason).toBe('You entered this value.');
	});

	it('checks follow the use, the period and the families the need proposes', () => {
		const ids = (patch: Partial<PurposeAnswers>) => resolveChecks(g, answers({ theme: 'cities', need: 'movement', ...patch })).map((c) => c.id);
		expect(ids({ use: 'measure' })).toContain('accuracy');
		expect(ids({ use: 'combine' })).toContain('cross-sensor');
		expect(ids({ use: 'map' })).toContain('map-accuracy');
		expect(ids({ timeframe: 'ongoing' })).toContain('continuity');
		expect(ids({ timeframe: 'long' })).toContain('record-period');
		expect(ids({ detail: 'fine', frequency: 'weeks' })).toEqual(expect.arrayContaining(['smallest-feature', 'usable-observations']));
		expect(ids({})).toEqual(['area-period', 'quality-indicators', 'suitability']);
		const radarWater = resolveChecks(g, answers({ theme: 'water', need: 'water' })).map((c) => c.id);
		expect(radarWater).toEqual(expect.arrayContaining(['cloud', 'water-under-vegetation']));
		const thermalWater = resolveChecks(g, answers({ theme: 'water', need: 'temperature' })).map((c) => c.id);
		expect(thermalWater).not.toContain('cloud');
	});

	it('retains independent constraints and selections, and shows a diff', () => {
		const current = state({ search: 'sentinel', scope: 'All statuses', family: 'Surface Temperature', criteria: { radiometric_bit_depth: { mode: 'preferred', value: 12 }, revisit_days: { mode: 'required', value: 5 } }, shortlist: ['a', 'b', 'c', 'd'], compare: ['a', 'b'] });
		const proposal = proposePurpose(wetlands, g, current);
		expect(proposal.next.search).toBe('sentinel');
		expect(proposal.next.scope).toBe('All statuses');
		expect(proposal.next.shortlist).toEqual(['a', 'b', 'c', 'd']);
		expect(proposal.next.criteria.radiometric_bit_depth).toEqual({ mode: 'preferred', value: 12 });
		expect(proposal.next.criteria.revisit_days).toBeUndefined();
		expect(proposal.changes.map((c) => c.label)).toEqual(['Measurement family', 'Reported coverage', 'Spatial resolution', 'Nominal revisit']);
		expect(proposal.retained.join(' ')).toMatch(/Search “sentinel”.*Radiometric bit depth.*Shortlist \(4\)/);
	});

	it('detects manual adjustment after applying without re-applying anything', () => {
		const proposal = proposePurpose(wetlands, g, state());
		expect(sameSettings(proposal.settings, currentJourneySettings(proposal.next))).toBe(true);
		const edited = { ...proposal.next, criteria: { ...proposal.next.criteria, geographic_coverage: { mode: 'required' as const, value: 'Global' } } };
		expect(sameSettings(proposal.settings, currentJourneySettings(edited))).toBe(false);
	});

	it('does not alter built-in profiles (Monitor Change still requires 5-day revisit when applied)', () => {
		const profiles: Profile[] = parity('profiles_normalised.json');
		const monitor = profiles.find((p) => p.id === 'monitor-change')!;
		expect(previewProfile(state(), monitor).next.criteria.revisit_days).toEqual({ mode: 'required', value: 5 });
	});

	it('maps answers to qualitative imagery states only', () => {
		expect(visualState(answers(), g)).toEqual({ family: 'neutral', detail: 'fine' });
		expect(visualState(answers({ need: 'movement', detail: 'regional' }), g)).toEqual({ family: 'radar', detail: 'coarse' });
		expect(visualState(answers({ need: 'temperature' }), g).family).toBe('thermal');
		expect(visualState(answers({ need: 'water' }), g).family).toBe('radar');
	});

	it('gives next actions from existing product links', () => {
		const check = resolveChecks(g, wetlands).find((c) => c.id === 'seasonal-observations')!;
		const actions = checkActions(check, byId['sentinel2-level2a']!, g, '/products/sentinel2-level2a');
		expect(actions[0]!.url).toBe(byId['sentinel2-level2a']!.access_url);
		const validation = resolveChecks(g, wetlands).find((c) => c.id === 'validation')!;
		expect(checkActions(validation, null, g)[0]!.url).toContain('ramsar.org');
	});
});

describe('optical-and-radar family filter', () => {
	it('keeps both families, round-trips in links and labels the chip', () => {
		const s = state({ family: OPTICAL_AND_RADAR });
		const families = new Set(metadataFilter(catalogue, toFilterState(s)).map((p) => p.product_family));
		expect(families).toEqual(new Set(['Surface Reflectance', 'Synthetic Aperture Radar']));
		const query = queryString(s);
		expect(query).toContain('fam=sr-sar');
		expect(parseUrlState(new URLSearchParams(query)).state.family).toBe(OPTICAL_AND_RADAR);
	});
});

describe('URL and session extensions', () => {
	it('round-trips the public purpose key and version; private text never enters the URL', () => {
		const s = proposePurpose({ ...wetlands, notes: 'Secret Swamp', period: 'private', timeframe: 'custom' }, g, state()).next;
		const query = queryString(s);
		expect(query).toContain('pu=water%7Ewater%7Echange');
		expect(query).toContain('gv=2');
		expect(query).not.toMatch(/Secret|private/);
		expect(parseUrlState(new URLSearchParams(query)).state.purpose).toBe('water~water~change');
	});
	it('treats a bare version parameter as not meaningful', () => {
		expect(hasMeaningfulState(parseUrlState(new URLSearchParams('v=1')))).toBe(false);
		expect(hasMeaningfulState(parseUrlState(new URLSearchParams('')))).toBe(false);
		expect(hasMeaningfulState(parseUrlState(new URLSearchParams('v=1&scope=assessed')))).toBe(false);
		expect(hasMeaningfulState(parseUrlState(new URLSearchParams('v=1&sl=landsat-c2-sr')))).toBe(true);
		expect(hasMeaningfulState(parseUrlState(new URLSearchParams('v=1&pu=water')))).toBe(true);
	});
	it('rejects malformed purpose keys but keeps the criteria', () => {
		const parsed = parseUrlState(new URLSearchParams('v=1&pu=<script>&rev=req:5'));
		expect(parsed.state.purpose).toBeNull();
		expect(parsed.state.criteria.revisit_days).toEqual({ mode: 'required', value: 5 });
		expect(parsed.issues.join(' ')).toContain('purpose in this link was not recognised');
	});
	it('validates stored purpose state, including coverage, and check outcomes', () => {
		const data = emptySession();
		const result = validateSession({
			...data,
			purpose: {
				draft: { theme: 'water' },
				applied: {
					answers: wetlands,
					key: 'water~water~change',
					guidanceVersion: '2',
					mappingVersion: 2,
					appliedAt: 'x',
					settings: { family: OPTICAL_AND_RADAR, spatial_resolution_m: null, revisit_days: { mode: 'bogus', value: 3 }, geographic_coverage: { mode: 'preferred', value: 'Global' } }
				},
				skipped: true,
				checks: { 'landsat-c2-sr': { cloud: { outcome: 'concern', note: 'wet season cloudy' }, 'Bad Id': { outcome: 'supports' } }, 'bad id': {} }
			}
		});
		expect(result.data.purpose.skipped).toBe(true);
		expect(result.data.purpose.applied?.settings.revisit_days).toBeNull();
		expect(result.data.purpose.applied?.settings.geographic_coverage).toEqual({ mode: 'preferred', value: 'Global' });
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

	it('copied summary carries purpose, guidance version/status, notes, outcomes and next actions', () => {
		const s = proposePurpose(wetlands, g, state({ shortlist: ['landsat-c2-sr'] })).next;
		const context = contextLines(wetlands, g, new Date('2026-11-11'));
		const text = buildSelectionSummary({
			snapshot: new Date('2026-11-11T00:00:00Z'),
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
				output: 'track change through time',
				userNotes: 'Macquarie Marshes',
				area: context.area,
				period: context.period,
				assumptions: ['Satellite products are inputs.'],
				notes: [],
				outputNote: outputNote(g, wetlands),
				checks,
				outcome,
				adjusted: true
			}
		});
		for (const expected of ['not a CEOS suitability assessment', 'surface water and flooding', 'How the data will be used: track change through time', 'Scale (orders by reported coverage', 'a continent or region', 'Your notes: Macquarie Marshes', 'guidance version 2, mapping version 2', 'Illustrative guidance', 'Filters were adjusted', 'Ramsar', 'WGCV-56', 'Cloud-free optical observations in your wet season — Checked — concern (Wet season is cloudy)', 'next: Check acquisitions in the provider portal: https://earthexplorer.usgs.gov/']) {
			expect(text).toContain(expected);
		}
	});
});

describe('experience, scale and period', () => {
	it('offers scale choices tied to coverage levels and simple period ranges', () => {
		expect(g.regions.map((r) => [r.id, r.coverage])).toEqual([['global', 'Global'], ['continent', 'Continental or multi-country'], ['country', 'National'], ['site', null]]);
		expect(g.timeframes.map((t) => t.id)).toEqual(['recent', 'since-2015', 'long', 'ongoing', 'custom']);
		expect(timeframeRange(g.timeframes.find((t) => t.id === 'long')!, new Date('2026-11-11'))).toBe('2006–2026');
		expect(timeframeRange(g.timeframes.find((t) => t.id === 'ongoing')!)).toBeNull();
	});

	it('words scale and period readably, only when private details are included', () => {
		const a = answers({ theme: 'cities', need: 'movement', region: 'country', timeframe: 'custom', period: '2019–2024' });
		expect(purposeSentence(a, g)).toBe('My work is about cities and infrastructure, needing to see ground movement and structure, within one country during 2019–2024.');
		expect(purposeSentence(a, g, { includePrivate: false })).toBe('My work is about cities and infrastructure, needing to see ground movement and structure.');
		expect(contextLines(answers({ timeframe: 'recent' }), g, new Date('2026-11-11'))).toEqual({ area: '', period: 'the last couple of years (2024–2026)' });
	});

	it('never puts experience, notes or period in the public key or filters', () => {
		const a = answers({ ...wetlands, experience: 'specialist', notes: 'oceania', timeframe: 'long' });
		expect(purposeKey(a)).toBe('water~water~change');
		const next = proposePurpose(a, g, state()).next;
		expect(queryString(next)).not.toMatch(/specialist|oceania|long/);
		expect(proposePurpose(a, g, state()).settings).toEqual(proposePurpose(wetlands, g, state()).settings);
	});

	it('changes only disclosure defaults by experience', () => {
		expect(EXPERIENCE_DISCLOSURE.specialist['more-filters']).toBe(true);
		expect(EXPERIENCE_DISCLOSURE.new['family-help']).toBe(true);
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
