import { describe, expect, it } from 'vitest';
import { NEUTRAL_STATE, type ExplorerState } from '../../src/lib/domain/explorer';
import { buildCustomProfile } from '../../src/lib/domain/profiles';
import { createSessionAdapter, emptySession, SESSION_KEY, validateSession } from '../../src/lib/state/session';
import { parseUrlState, queryString, serialiseUrlState } from '../../src/lib/state/url';

const parse = (query: string) => parseUrlState(new URLSearchParams(query));

describe('URL state contract v1', () => {
	it('round-trips every public field', () => {
		const state: ExplorerState = {
			...structuredClone(NEUTRAL_STATE),
			search: 'landsat surface',
			family: 'Surface Reflectance',
			scope: 'All statuses',
			providers: ['USGS', 'Sinergise and Digital Earth Africa', 'A, B'],
			sensor: 'OLI',
			operational: ['Operational'],
			sources: ['MIM API product'],
			hideUnknown: true,
			includeMim: true,
			criteria: {
				spatial_resolution_m: { mode: 'required', value: 2.5 },
				revisit_days: { mode: 'preferred', value: 16 },
				radiometric_bit_depth: { mode: 'not_used', value: 12 },
				geographic_coverage: { mode: 'preferred', value: 'Continental or multi-country' }
			},
			shortlist: ['landsat-c2-sr', 'sentinel2-level2a', 'mim-product:158', 'enmap-l2a'],
			compare: ['landsat-c2-sr', 'mim-product:158'],
			fields: ['technical', 'provenance'],
			profileId: 'map-land-features'
		};
		const parsed = parse(queryString(state));
		expect(parsed.issues).toEqual([]);
		expect(parsed.explicit).toBe(true);
		expect(parsed.state).toEqual(state);
	});

	it('treats a URL without v as non-explicit neutral state', () => {
		const parsed = parse('');
		expect(parsed.explicit).toBe(false);
		expect(parsed.state).toEqual(NEUTRAL_STATE);
		expect(serialiseUrlState(NEUTRAL_STATE).toString()).toBe('v=1');
	});

	it('ignores invalid portions with recovery messages and never substitutes products', () => {
		const parsed = parse('v=1&fam=xx&scope=bogus&res=req:abc&rev=maybe:3&bits=req:12.5&cov=pref:everywhere&sl=a,,bad id,a,b&cmp=b,c,d,e&fields=technical,nope&p=custom-1&zzz=1&mim=yes');
		expect(parsed.state.family).toBe('All product families');
		expect(parsed.state.scope).toBe('CEOS-ARD assessed only');
		expect(parsed.state.criteria).toEqual({});
		expect(parsed.state.shortlist).toEqual(['a', 'b', 'c', 'd', 'e']);
		expect(parsed.state.compare).toEqual(['b', 'c', 'd']);
		expect(parsed.state.fields).toEqual(['technical']);
		expect(parsed.state.profileId).toBeNull();
		expect(parsed.issues.length).toBeGreaterThanOrEqual(10);
	});

	it('bounds numeric ranges and text length', () => {
		expect(parse('v=1&res=req:0.05').state.criteria).toEqual({});
		expect(parse('v=1&res=req:100001').state.criteria).toEqual({});
		expect(parse('v=1&rev=pref:365').state.criteria.revisit_days).toEqual({ mode: 'preferred', value: 365 });
		expect(parse('v=1&res=req:1e3').state.criteria).toEqual({});
		const long = parse(`v=1&q=${'x'.repeat(500)}`);
		expect(long.state.search).toHaveLength(200);
		expect(long.issues[0]).toContain('shortened');
	});

	it('keeps more than three shortlist entries while capping comparison at three', () => {
		const ids = Array.from({ length: 5 }, (_, i) => `p${i}`).join(',');
		const parsed = parse(`v=1&sl=${ids}&cmp=p0,p1,p2`);
		expect(parsed.state.shortlist).toHaveLength(5);
		expect(parsed.state.compare).toEqual(['p0', 'p1', 'p2']);
	});

	it('reports oversized shortlists instead of silently dropping them', () => {
		const ids = Array.from({ length: 65 }, (_, i) => `p${i}`).join(',');
		const parsed = parse(`v=1&sl=${ids}`);
		expect(parsed.state.shortlist).toHaveLength(60);
		expect(parsed.issues.join(' ')).toContain('copied selection summary');
	});
});

describe('session storage adapter', () => {
	function memoryStorage(): Storage {
		const map = new Map<string, string>();
		return {
			get length() {
				return map.size;
			},
			clear: () => map.clear(),
			getItem: (key) => map.get(key) ?? null,
			key: (index) => [...map.keys()][index] ?? null,
			removeItem: (key) => void map.delete(key),
			setItem: (key, value) => void map.set(key, String(value))
		};
	}

	it('persists and restores versioned data', () => {
		const storage = memoryStorage();
		const adapter = createSessionAdapter(storage);
		const data = emptySession();
		data.customProfiles.push(buildCustomProfile({ id: 'custom-abc', name: 'Radar shortlist', description: '', family: 'Synthetic Aperture Radar', scope: 'CEOS-ARD assessed only', hideUnknown: false, criteria: { spatial_resolution_m: { mode: 'required', value: 20 } } }));
		data.notes['landsat-c2-sr'] = { rationale: 'Long archive', openChecks: 'Cloud', criteriaFingerprint: 'x', updatedAt: '2026-10-09' };
		expect(adapter.write(data)).toBe(true);
		const restored = createSessionAdapter(storage).read();
		expect(restored.issues).toEqual([]);
		expect(restored.data).toEqual(data);
	});

	it('recovers from corrupt, foreign-version and partially invalid data', () => {
		const storage = memoryStorage();
		storage.setItem(SESSION_KEY, '{not json');
		expect(createSessionAdapter(storage).read().issues[0]).toContain('reset');
		storage.setItem(SESSION_KEY, JSON.stringify({ version: 99 }));
		expect(createSessionAdapter(storage).read().issues[0]).toContain('incompatible');
		const partial = validateSession({ version: 1, customProfiles: [{ id: 'custom-ok', name: 'Fine name', criteria: {} }, { id: 'bad', name: 'x' }], notes: { 'bad id': {}, ok: { rationale: 5 } } });
		expect(partial.data.customProfiles.map((p) => p.id)).toEqual(['custom-ok']);
		expect(partial.issues).toHaveLength(1);
		expect(partial.data.notes).toEqual({ ok: { rationale: '', openChecks: '', criteriaFingerprint: '', updatedAt: '' } });
	});

	it('keeps working in memory when storage is unavailable or full', () => {
		const unavailable = createSessionAdapter(null);
		expect(unavailable.persistent).toBe(false);
		expect(unavailable.write(emptySession())).toBe(false);
		const full = memoryStorage();
		full.setItem = () => {
			throw new DOMException('quota', 'QuotaExceededError');
		};
		const adapter = createSessionAdapter(full);
		expect(adapter.write(emptySession())).toBe(false);
		expect(adapter.persistent).toBe(false);
	});
});
