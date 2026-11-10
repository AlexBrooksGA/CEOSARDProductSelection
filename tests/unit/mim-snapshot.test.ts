import { describe, expect, it } from 'vitest';
import { mimDetailsFor, mimEditionText, MimSnapshotError, parseMimSnapshot } from '../../src/lib/domain/mim';
import { readJson } from './fixtures';

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
