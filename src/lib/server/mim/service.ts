/**
 * MIM product loading with a bounded, process-local cache. Server-only.
 *
 * - One cache entry (the joined product/instrument collection), default freshness 6 hours
 *   (the prototype's `st.cache_data(ttl=21_600)`), capped at `maxProducts` records.
 * - Concurrent loads/refreshes share one in-flight upstream request.
 * - Failures are never cached as an empty success: the last good data stays usable and is
 *   marked stale with a sanitised error.
 * - Refresh is limited by a cooldown, and a failed attempt starts a short back-off, so
 *   repeated clicks cannot produce an unbounded burst of upstream requests.
 * - The cache resets when the Node process restarts and is not shared across replicas.
 */
import { deduplicateProducts } from '$lib/domain/catalogue';
import type { Product } from '$lib/domain/types';
import { MIM_ERROR_MESSAGES, MimError, type MimErrorKind } from './errors';
import { assertTrusted, assertUnderBasePath, createMimHttp, type MimHttp } from './http';
import { instrumentIndex, normaliseMimProduct, toBrowserProduct } from './normalise';
import { collectionPath, declaredSchemaUrl, findMissionEndpoint, joinPath, serverRoot } from './schema';

/** Public CEOS Database API (CEOS MIM database). No credentials needed; CC BY 4.0. */
export const DEFAULT_BASE_URL = 'https://ceos-capabilities.org/api';
/** Attribution required by the CEOS MIM database licence. */
export const MIM_ATTRIBUTION = 'CEOS MIM Database, https://database.eohandbook.com';

export interface MimServiceOptions {
	baseUrl?: string;
	/** Turn MIM off for this deployment (MIMS_API_BASE_URL=off). */
	disabled?: boolean;
	username?: string;
	password?: string;
	apiKey?: string;
	ttlMs?: number;
	refreshCooldownMs?: number;
	failureBackoffMs?: number;
	deadlineMs?: number;
	requestTimeoutMs?: number;
	maxResponseBytes?: number;
	maxProducts?: number;
	retries?: number;
	fetchImpl?: typeof fetch;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
	log?: (message: string) => void;
}

export type MimState = 'not_configured' | 'not_loaded' | 'loading' | 'ready' | 'stale' | 'error';

/** Browser-safe status: no credentials, URLs with credentials, headers or raw payloads. */
export interface MimStatus {
	configured: boolean;
	state: MimState;
	message: string;
	errorKind: MimErrorKind | null;
	productCount: number;
	fetchedAt: string | null;
	expiresAt: string | null;
	lastAttemptAt: string | null;
	ttlHours: number;
	retryAfterSeconds: number | null;
	endpoints: { products: string; instruments: string } | null;
	/** Public API host, for display (never credentials). */
	host: string | null;
	/** Database edition and licence from the API's /meta, when available. */
	edition: MimEdition | null;
}

export interface MimEdition {
	/** Short identifier registry edition, e.g. "e574f0c2". */
	edition: string | null;
	/** Data extract date (ISO), e.g. "2026-10-23". */
	asOf: string | null;
	licence: { name: string; url: string | null } | null;
	attribution: string;
}

export interface MimLoadResult {
	status: MimStatus;
	products: Product[] | null;
}

interface CacheEntry {
	products: Product[];
	fetchedAt: number;
	endpoints: { products: string; instruments: string };
	edition: MimEdition | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Read the small provenance document; anything unexpected is dropped, never trusted. */
export function parseMimEdition(payload: unknown): MimEdition | null {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
	const meta = payload as Json;
	const text = (value: unknown, max = 120) => (typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null);
	const edition = text(meta.registry_edition, 32);
	const asOf = text(meta.as_of, 10);
	const licence = meta.licence && typeof meta.licence === 'object' && !Array.isArray(meta.licence) ? (meta.licence as Json) : null;
	const licenceName = licence ? text(licence.name, 60) : null;
	const licenceUrl = licence ? text(licence.url, 200) : null;
	return {
		edition: edition && /^[A-Za-z0-9._:-]+$/.test(edition) ? edition : null,
		asOf: asOf && ISO_DATE.test(asOf) ? asOf : null,
		licence: licenceName ? { name: licenceName, url: licenceUrl && /^https:\/\//.test(licenceUrl) ? licenceUrl : null } : null,
		attribution: MIM_ATTRIBUTION
	};
}

type Json = Record<string, unknown>;

function namedCollection(payload: unknown, key: 'products' | 'instruments'): Json[] {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray((payload as Json)[key])) {
		throw new MimError('response', `The MIM ${key} response has an unexpected structure.`);
	}
	return ((payload as Json)[key] as unknown[]).filter((item): item is Json => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
}

export class MimService {
	private readonly options: Required<Omit<MimServiceOptions, 'username' | 'password' | 'apiKey' | 'fetchImpl' | 'sleep' | 'log'>> & Pick<MimServiceOptions, 'username' | 'password' | 'apiKey' | 'fetchImpl' | 'sleep' | 'log'>;
	private cache: CacheEntry | null = null;
	private inflight: Promise<void> | null = null;
	private lastAttempt: number | null = null;
	private lastError: MimError | null = null;
	private lastErrorAt: number | null = null;

	constructor(options: MimServiceOptions = {}) {
		this.options = {
			baseUrl: (options.baseUrl || DEFAULT_BASE_URL).trim(),
			disabled: options.disabled ?? false,
			username: options.username,
			password: options.password,
			apiKey: options.apiKey,
			ttlMs: options.ttlMs ?? 6 * 60 * 60 * 1000,
			refreshCooldownMs: options.refreshCooldownMs ?? 60_000,
			failureBackoffMs: options.failureBackoffMs ?? 30_000,
			deadlineMs: options.deadlineMs ?? 60_000,
			requestTimeoutMs: options.requestTimeoutMs ?? 25_000,
			maxResponseBytes: options.maxResponseBytes ?? 20 * 1024 * 1024,
			maxProducts: options.maxProducts ?? 5_000,
			retries: options.retries ?? 2,
			now: options.now ?? Date.now,
			fetchImpl: options.fetchImpl,
			sleep: options.sleep,
			log: options.log
		};
	}

	/**
	 * Configured unless turned off, the base URL is unsafe, or only half of a Basic credential
	 * pair is set (a misconfiguration that would otherwise fail obscurely upstream).
	 */
	get configured(): boolean {
		const halfCredentials = Boolean(this.options.username) !== Boolean(this.options.password);
		return !this.options.disabled && !halfCredentials && this.validBaseUrl();
	}

	private validBaseUrl(): boolean {
		try {
			const url = new URL(this.options.baseUrl);
			if (url.username || url.password || url.search || url.hash) return false;
			const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
			return url.protocol === 'https:' || (url.protocol === 'http:' && local);
		} catch {
			return false;
		}
	}

	private now(): number {
		return this.options.now();
	}

	private fresh(): boolean {
		return Boolean(this.cache && this.now() < this.cache.fetchedAt + this.options.ttlMs);
	}

	status(): MimStatus {
		const iso = (value: number | null) => (value === null ? null : new Date(value).toISOString());
		const base = {
			configured: this.configured,
			productCount: this.cache?.products.length ?? 0,
			fetchedAt: iso(this.cache?.fetchedAt ?? null),
			expiresAt: iso(this.cache ? this.cache.fetchedAt + this.options.ttlMs : null),
			lastAttemptAt: iso(this.lastAttempt),
			ttlHours: this.options.ttlMs / 3_600_000,
			endpoints: this.cache?.endpoints ?? null,
			retryAfterSeconds: null as number | null,
			host: this.validBaseUrl() && !this.options.disabled ? new URL(this.options.baseUrl).host : null,
			edition: this.cache?.edition ?? null
		};
		if (!this.configured) {
			return { ...base, state: 'not_configured', message: MIM_ERROR_MESSAGES.not_configured, errorKind: 'not_configured' };
		}
		if (this.inflight) return { ...base, state: 'loading', message: 'Loading MIM product and instrument records…', errorKind: null };
		const recentError = this.lastError && this.lastErrorAt !== null && (!this.cache || this.lastErrorAt >= this.cache.fetchedAt) ? this.lastError : null;
		if (this.cache) {
			if (recentError) {
				return { ...base, state: 'stale', message: `${recentError.message.replace(' The curated catalogue remains available.', '')} Showing MIM records last loaded ${base.fetchedAt}.`, errorKind: recentError.kind };
			}
			if (!this.fresh()) return { ...base, state: 'stale', message: `MIM records were loaded ${base.fetchedAt} and are older than ${base.ttlHours} hours. Refresh to update them.`, errorKind: null };
			return { ...base, state: 'ready', message: `${base.productCount} MIM product records loaded ${base.fetchedAt}, joined to instruments by stable instrument ID.`, errorKind: null };
		}
		if (recentError) return { ...base, state: 'error', message: recentError.message, errorKind: recentError.kind };
		return { ...base, state: 'not_loaded', message: 'MIM records have not been loaded.', errorKind: null };
	}

	private result(extra: Partial<MimStatus> = {}): MimLoadResult {
		return { status: { ...this.status(), ...extra }, products: this.cache ? this.cache.products : null };
	}

	private inBackoff(): number | null {
		if (this.lastErrorAt === null) return null;
		const remaining = this.lastErrorAt + this.options.failureBackoffMs - this.now();
		return remaining > 0 ? remaining : null;
	}

	/** Deliberate "Load MIM products": serve the fresh cache, otherwise fetch (coalesced). */
	async load({ cachedOnly = false }: { cachedOnly?: boolean } = {}): Promise<MimLoadResult> {
		if (!this.configured) return this.result();
		if (cachedOnly || this.fresh()) return this.result();
		if (this.inflight) {
			await this.inflight;
			return this.result();
		}
		const backoff = this.inBackoff();
		if (backoff !== null) return this.result({ retryAfterSeconds: Math.ceil(backoff / 1000) });
		await this.startFetch();
		return this.result();
	}

	/** Deliberate "Refresh MIM data": re-fetch unless an attempt was made within the cooldown. */
	async refresh(): Promise<MimLoadResult> {
		if (!this.configured) return this.result();
		if (this.inflight) {
			await this.inflight;
			return this.result();
		}
		if (this.lastAttempt !== null) {
			const wait = this.lastAttempt + this.options.refreshCooldownMs - this.now();
			if (wait > 0) {
				return this.result({ retryAfterSeconds: Math.ceil(wait / 1000), message: `MIM data was requested recently. Try refreshing again in ${Math.ceil(wait / 1000)} seconds. ${this.status().message}` });
			}
		}
		await this.startFetch();
		return this.result();
	}

	private startFetch(): Promise<void> {
		this.lastAttempt = this.now();
		this.inflight = this.fetchAll()
			.then((entry) => {
				this.cache = entry;
				this.lastError = null;
				this.lastErrorAt = null;
			})
			.catch((error: unknown) => {
				const mimError = error instanceof MimError ? error : new MimError('response', error instanceof Error ? error.name : 'unknown failure');
				this.lastError = mimError;
				this.lastErrorAt = this.now();
				this.options.log?.(`MIM load failed (${mimError.kind}): ${mimError.detail}`);
			})
			.finally(() => {
				this.inflight = null;
			});
		return this.inflight;
	}

	private async fetchAll(): Promise<CacheEntry> {
		const { baseUrl } = this.options;
		const http: MimHttp = createMimHttp({
			baseUrl,
			username: this.options.username,
			password: this.options.password,
			apiKey: this.options.apiKey,
			requestTimeoutMs: this.options.requestTimeoutMs,
			maxResponseBytes: this.options.maxResponseBytes,
			retries: this.options.retries,
			fetchImpl: this.options.fetchImpl,
			sleep: this.options.sleep
		});
		const deadline = Date.now() + this.options.deadlineMs;
		const docsUrl = new URL('docs/', baseUrl.replace(/\/+$/, '') + '/').href;
		const html = await http.getText(docsUrl, deadline);
		const declared = declaredSchemaUrl(html);
		if (!declared) throw new MimError('schema', 'The API documentation did not declare an OpenAPI schema URL.');
		const schemaUrl = assertTrusted(new URL(declared, docsUrl).href, baseUrl).href;
		const schema = await http.getJson(schemaUrl, deadline);
		if (!schema || typeof schema !== 'object' || Array.isArray(schema) || !(schema as Json).paths || typeof (schema as Json).paths !== 'object') {
			throw new MimError('schema', 'The MIM OpenAPI schema has an unexpected structure.');
		}
		findMissionEndpoint(schema as Json);
		const productPath = collectionPath(schema as Json, 'products');
		const instrumentPath = collectionPath(schema as Json, 'instruments');
		const root = serverRoot(schema as Json, schemaUrl, baseUrl);
		const productUrl = joinPath(root, productPath);
		const instrumentUrl = joinPath(root, instrumentPath);
		assertUnderBasePath(productUrl, baseUrl);
		assertUnderBasePath(instrumentUrl, baseUrl);
		const products = namedCollection(await http.getJson(productUrl, deadline), 'products');
		const instruments = namedCollection(await http.getJson(instrumentUrl, deadline), 'instruments');
		if (products.length > this.options.maxProducts) throw new MimError('too_large', `${products.length} products exceeds ${this.options.maxProducts}`);
		const index = instrumentIndex(instruments);
		const records = deduplicateProducts(
			products.map((item) => normaliseMimProduct(item, index, productUrl)).filter((record): record is Product => record !== null).map(toBrowserProduct)
		);
		// Edition and licence are optional extras: a missing or failed /meta never fails the load.
		let edition: MimEdition | null = null;
		const paths = (schema as Json).paths as Json;
		if (paths['/meta']) {
			try {
				const metaUrl = joinPath(root, '/meta');
				assertUnderBasePath(metaUrl, baseUrl);
				edition = parseMimEdition(await http.getJson(metaUrl, deadline));
			} catch (error) {
				this.options.log?.(`MIM edition unavailable (${error instanceof MimError ? error.kind : 'error'})`);
			}
		}
		return { products: records, fetchedAt: this.now(), endpoints: { products: productPath, instruments: instrumentPath }, edition };
	}
}
