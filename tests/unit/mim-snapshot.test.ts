import { describe, expect, it } from 'vitest';
import { mimDetailsFor, mimEditionText, MimSnapshotError, parseMimSnapshot } from '../../src/lib/domain/mim';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readJson, ROOT } from './fixtures';

const curated = readJson<{ id: string; ceos_ard_verified: boolean }[]>('data/ceos_ard_products.json');
const ids = curated.map((p) => p.id);
const raw = () => structuredClone(readJson<any>('data/mim/snapshot.json'));
const links = readJson<any>('data/mim/links.json');

describe('MIM links and snapshot', () => {
	it('links every curated product exactly once, and the snapshot matches the links', () => {
		const linked = links.links.map((l: any) => l.product_id);
		expect(new Set(linked).size).toBe(linked.length);
		expect([...linked].sort()).toEqual([...ids].sort());
		const snapshot = parseMimSnapshot(raw(), ids);
		for (const link of links.links) {
			expect(snapshot.products[link.product_id]!.mim_product.product_id).toBe(link.mim_product_id);
			expect(snapshot.products[link.product_id]!.mission_ids).toEqual(link.mission_ids);
		}
	});

	it('records the source edition, licence and attribution', () => {
		const snapshot = parseMimSnapshot(raw(), ids);
		expect(snapshot.source.attribution).toBe('CEOS MIM Database, https://database.eohandbook.com');
		expect(snapshot.source.licence.name).toBe('CC BY 4.0');
		expect(mimEditionText(snapshot.source)).toMatch(/^edition [0-9a-f]{8}, data as of \d{4}-\d{2}-\d{2}$/);
	});

	it('resolves missions and instruments for a curated product', () => {
		const details = mimDetailsFor(parseMimSnapshot(raw(), ids), 'landsat-c2-sr')!;
		expect(details.missions.map((m) => m.acronym)).toEqual(['Landsat 4', 'Landsat 5', 'Landsat 7', 'Landsat 8', 'Landsat 9']);
		expect(details.instruments.map((i) => i.name_short).sort()).toEqual(['ETM+', 'OLI', 'OLI-2', 'TM']);
		expect(details.missions.find((m) => m.acronym === 'Landsat 8')!.launch_date).toBe('2013-02-11');
		expect(mimDetailsFor(parseMimSnapshot(raw(), ids), 'not-a-product')).toBeNull();
		expect(mimDetailsFor(null, 'landsat-c2-sr')).toBeNull();
	});

	it('includes radar parameters for SAR instruments', () => {
		const details = mimDetailsFor(parseMimSnapshot(raw(), ids), 'alos2-palsar2-25m-scansar-nrb')!;
		expect(details.instruments[0]!.sar!.band).toBe('L-Band');
		expect(details.instruments[0]!.sar!.imaging_modes.length).toBeGreaterThan(0);
	});

	it('MIM and the curated catalogue agree on which linked products are CEOS-ARD assessed', () => {
		const snapshot = parseMimSnapshot(raw(), ids);
		for (const product of curated) {
			const m = snapshot.products[product.id]!.mim_product;
			const assessed = m.statuses.includes('CEOS-ARD') && Boolean(m.certification?.approval_date || m.certification?.review_url);
			expect([product.id, assessed]).toEqual([product.id, product.ceos_ard_verified]);
		}
	});

	it('adds constellation records for commercial constellations (StriX demonstrators are complete; the constellation is active)', () => {
		const details = mimDetailsFor(parseMimSnapshot(raw(), ids), 'synspective-strix-nrb')!;
		expect(details.missions.every((m) => /complete/i.test(m.status ?? ''))).toBe(true);
		expect(details.constellations[0]!.name_short).toBe('StriX');
		expect(details.constellations[0]!.active_unit_count).toBeGreaterThan(0);
		expect(mimDetailsFor(parseMimSnapshot(raw(), ids), 'landsat-c2-sr')!.constellations).toEqual([]);
	});

	it('keeps upgraded https review links (CEOS pages listed with http)', () => {
		const constellr = parseMimSnapshot(raw(), ids).products['constellr-lstprecision']!.mim_product;
		expect(constellr.certification!.review_url).toMatch(/^https:\/\/ceos\.org\//);
	});

	it('accepts a mission without a visual and rejects unsafe credit links or prototype keys', () => {
		const noVisual = raw();
		noVisual.missions['547'].visual = null;
		expect(() => parseMimSnapshot(noVisual, ids)).not.toThrow();
		const credit = raw();
		const withCredit = Object.values<any>(credit.missions).find((m) => m.visual?.credit)!;
		withCredit.visual.credit.source_url = 'http://insecure.example/image';
		expect(() => parseMimSnapshot(credit, ids)).toThrow(/credit URLs must be https/);
		const proto = raw();
		proto.products['landsat-c2-sr'].mission_ids.push('toString');
		expect(() => parseMimSnapshot(proto, ids)).toThrow(/missing mission toString/);
		const review = raw();
		review.products['landsat-c2-sr'].mim_product.certification.review_url = 'ftp://x';
		expect(() => parseMimSnapshot(review, ids)).toThrow(/review_url must be https/);
	});

	it('rejects broken links, unsafe URLs and unknown products', () => {
		const missing = raw();
		missing.products['landsat-c2-sr'].mission_ids.push(999999);
		expect(() => parseMimSnapshot(missing, ids)).toThrow(/missing mission 999999/);
		const url = raw();
		url.missions['547'].eoportal_url = 'javascript:alert(1)';
		expect(() => parseMimSnapshot(url, ids)).toThrow(/eoportal_url must be https/);
		const path = raw();
		path.missions['547'].visual.colour_512 = 'https://elsewhere.example/x.png';
		expect(() => parseMimSnapshot(path, ids)).toThrow(/must be an \/images\/ path/);
		expect(() => parseMimSnapshot(raw(), ids.filter((id) => id !== 'landsat-c2-sr'))).toThrow(/landsat-c2-sr is not a curated product/);
		expect(() => parseMimSnapshot({ schema: 'x' }, ids)).toThrow(MimSnapshotError);
	});
});

describe('MIM values in facts, comparison and the copied summary', async () => {
	const { mimSummary, mimSwathFill, mimInstrumentResolutionFill, mimInstrumentTypeFill, mimMissionStatusText, mimMissionYearsText } = await import('../../src/lib/domain/mim');
	const { withMimFill, textFact } = await import('../../src/lib/domain/facts');
	const { buildComparison } = await import('../../src/lib/domain/comparison');
	const { buildSelectionSummary } = await import('../../src/lib/domain/summary');
	const { NEUTRAL_STATE } = await import('../../src/lib/domain/explorer');
	const { parity } = await import('./fixtures');
	const snapshot = parseMimSnapshot(raw(), ids);
	const summaries = Object.fromEntries(ids.map((id) => [id, mimSummary(mimDetailsFor(snapshot, id)!)]));
	const byId = Object.fromEntries(parity<any[]>('catalogue_normalised.json').map((p) => [p.id, p]));

	it('fills only missing curated values, and marks them as MIM', () => {
		const landsat = byId['landsat-c2-sr'];
		const swath = withMimFill(textFact(landsat, 'Swath width', 'swath_width'), mimSwathFill(summaries['landsat-c2-sr']));
		expect(swath.value).toBe(landsat.swath_width);
		expect(swath.mim).toBeUndefined();
		const catalyst = byId['catalyst-sentinel1-rtc'];
		expect(catalyst.swath_width).toBeNull();
		const filled = withMimFill(textFact(catalyst, 'Swath width', 'swath_width'), mimSwathFill(summaries['catalyst-sentinel1-rtc']));
		expect(filled.mim).toBe(true);
		expect(filled.value).toBeTruthy();
		expect(filled.missing).toBeNull();
		expect(withMimFill(textFact(catalyst, 'Swath width', 'swath_width'), null).mim).toBeUndefined();
	});

	it('gives instrument resolution as instrument-level, never product resolution', () => {
		const fill = mimInstrumentResolutionFill(summaries['landsat-c2-sr'])!;
		expect(fill.value).toMatch(/^15 m \(/);
		expect(fill.basis).toMatch(/not product resolution/);
		expect(mimInstrumentTypeFill(summaries['alos2-palsar2-25m-scansar-nrb'])!.value).toMatch(/radar/i);
	});

	it('summarises mission status and years', () => {
		expect(mimMissionYearsText(summaries['landsat-c2-sr'])).toMatch(/^Landsat 4 1982–\d{4} · Landsat 5 1984–/);
		expect(mimMissionStatusText(summaries['synspective-strix-nrb'])).toMatch(/Mission complete \(all 2 missions\)/);
		expect(mimMissionStatusText(null)).toBeNull();
	});

	it('adds MIM-marked mission rows and gap fills to the comparison, and never touches matching rows', () => {
		const pair = [byId['landsat-c2-sr'], byId['catalyst-sentinel1-rtc']];
		const withMim = buildComparison(pair, {}, ['technical', 'instrument'], {}, null, null, summaries);
		const without = buildComparison(pair, {}, ['technical', 'instrument'], {}, null, null, {});
		const rows = (groups: any[]) => Object.fromEntries(groups.flatMap((g) => g.rows.map((r: any) => [r.id, r])));
		expect(rows(withMim)['mission-status'].cells.every((c: any) => c.mim)).toBe(true);
		expect(rows(without)['mission-status']).toBeUndefined();
		expect(rows(withMim).swath.cells[0].mim).toBeUndefined();
		expect(rows(withMim).swath.cells[1].mim).toBe(true);
		for (const id of ['spatial', 'revisit', 'coverage', 'status', 'pfs']) expect(rows(withMim)[id]).toEqual(rows(without)[id]);
	});

	it('lists missions with an asterisk and a source footnote in the copied summary', () => {
		const text = buildSelectionSummary({
			snapshot: new Date('2026-11-10T00:00:00Z'),
			shareUrl: 'https://example.test/shortlist?v=1',
			state: { ...structuredClone(NEUTRAL_STATE), shortlist: ['landsat-c2-sr'] },
			products: byId,
			notes: {},
			investigationNote: '',
			currentFingerprint: '',
			provenance: {},
			unresolvedReason: () => '',
			mimSummaries: summaries,
			mimSource: snapshot.source
		});
		expect(text).toMatch(/  Missions\*: Landsat 4 1982–/);
		expect(text).toMatch(/\n\* From the CEOS MIM database: CEOS MIM Database, https:\/\/database\.eohandbook\.com, edition [0-9a-f]{8}, data as of \d{4}-\d{2}-\d{2} \(CC BY 4\.0\)/);
	});
});

describe('mission end of life and link matching', () => {
	it('treats extended operations as not ended, and complete or past-date missions as ended', async () => {
		const { missionEnded, sameUrl } = await import('../../src/lib/domain/mim');
		expect(missionEnded({ status: 'Operational (extended)', eol_date: '2028-03-31' }, '2026-11-10')).toBe(false);
		expect(missionEnded({ status: 'Operational (extended)', eol_date: '2020-01-01' }, '2026-11-10')).toBe(false);
		expect(missionEnded({ status: 'Mission complete', eol_date: '2030-01-01' }, '2026-11-10')).toBe(true);
		expect(missionEnded({ status: null, eol_date: '2020-01-01' }, '2026-11-10')).toBe(true);
		expect(missionEnded({ status: 'Planned', eol_date: null }, '2026-11-10')).toBe(false);
		expect(sameUrl('http://www.example.org/a/#x', 'https://example.org/a')).toBe(true);
		expect(sameUrl('https://example.org/a', 'https://example.org/b')).toBe(false);
		expect(sameUrl(null, 'https://example.org')).toBe(false);
	});

	it('picks the newest mission with real artwork for each product', async () => {
		const { productVisual } = await import('../../src/lib/domain/mim');
		const visuals = { '547': { mission_id: 547, acronym: 'Landsat 8', icon: '/a.svg', image: null, credit: null }, '772': { mission_id: 772, acronym: 'Landsat 9', icon: '/b.svg', image: '/b.png', credit: null } };
		const details = mimDetailsFor(parseMimSnapshot(raw(), ids), 'landsat-c2-sr');
		expect(productVisual(details, visuals)).toMatchObject({ acronym: 'Landsat 9', mission_count: 5 });
		expect(productVisual(mimDetailsFor(parseMimSnapshot(raw(), ids), 'enmap-l2a'), visuals)).toBeNull();
	});

	it('vendored visuals: every icon and picture listed in the manifest exists, and pictures always carry a credit', () => {
		const manifest = readJson<any>('assets/mission_visuals/manifest.json');
		for (const entry of Object.values<any>(manifest.missions)) {
			expect(existsSync(resolve(ROOT, 'assets/mission_visuals', entry.icon))).toBe(true);
			if (entry.image) {
				expect(existsSync(resolve(ROOT, 'assets/mission_visuals', entry.image))).toBe(true);
				expect(entry.image_credit.rights_holder && entry.image_credit.license).toBeTruthy();
			}
		}
	});
});
