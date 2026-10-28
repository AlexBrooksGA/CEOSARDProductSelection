/**
 * Bounded, authenticated HTTP for the MIM API. Server-only.
 *
 * - Credentials are sent only to the configured trusted origin; redirects are followed
 *   manually and only within that origin.
 * - Per-request timeout, overall deadline, limited retries (as the prototype: two retries
 *   for 429/502/503/504 and connection errors) and a response-size cap.
 */
import { Buffer } from 'node:buffer';
import { MimError } from './errors';

export interface MimHttpConfig {
	baseUrl: string;
	username: string;
	password: string;
	requestTimeoutMs: number;
	maxResponseBytes: number;
	retries: number;
	fetchImpl?: typeof fetch;
	sleep?: (ms: number) => Promise<void>;
}

const RETRY_STATUSES = new Set([429, 502, 503, 504]);

export function trustedOrigin(baseUrl: string): string {
	return new URL(baseUrl).origin;
}

/** Credentials may only go to the configured origin. */
export function assertTrusted(url: string, baseUrl: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new MimError('untrusted_url', `Unparseable URL`);
	}
	if (parsed.origin !== trustedOrigin(baseUrl) || parsed.username || parsed.password) {
		throw new MimError('untrusted_url', `Refused request outside the trusted origin: ${parsed.origin}`);
	}
	return parsed;
}

/** Data endpoints must also sit under the configured API base path. */
export function assertUnderBasePath(url: string, baseUrl: string): void {
	const parsed = assertTrusted(url, baseUrl);
	const prefix = new URL(baseUrl).pathname.replace(/\/+$/, '') + '/';
	if (!(parsed.pathname + '/').startsWith(prefix) && parsed.pathname !== prefix.replace(/\/$/, '')) {
		throw new MimError('untrusted_url', `Refused path outside the configured API base path: ${parsed.pathname}`);
	}
}

function authHeader(username: string, password: string): string {
	const raw = `${username}:${password}`;
	const latin1 = [...raw].every((char) => char.charCodeAt(0) <= 0xff);
	return `Basic ${Buffer.from(raw, latin1 ? 'latin1' : 'utf8').toString('base64')}`;
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
	const declared = Number(response.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > maxBytes) throw new MimError('too_large', `Declared ${declared} bytes`);
	if (!response.body) return '';
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw new MimError('too_large', `Exceeded ${maxBytes} bytes`);
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks).toString('utf8');
}

export interface MimHttp {
	getText(url: string, deadline: number): Promise<string>;
	getJson(url: string, deadline: number): Promise<unknown>;
}

export function createMimHttp(config: MimHttpConfig): MimHttp {
	const fetchImpl = config.fetchImpl ?? fetch;
	const sleep = config.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
	const header = authHeader(config.username, config.password);

	async function once(url: string, deadline: number): Promise<Response> {
		let current = url;
		for (let hop = 0; hop < 4; hop += 1) {
			assertTrusted(current, config.baseUrl);
			const remaining = deadline - Date.now();
			if (remaining <= 0) throw new MimError('timeout', 'Overall deadline reached');
			const signal = AbortSignal.timeout(Math.min(config.requestTimeoutMs, remaining));
			let response: Response;
			try {
				response = await fetchImpl(current, { headers: { Authorization: header, Accept: 'application/json, text/html;q=0.9' }, redirect: 'manual', signal });
			} catch (error) {
				const name = error instanceof Error ? error.name : '';
				if (name === 'TimeoutError' || name === 'AbortError') throw new MimError('timeout', 'Request timed out');
				throw new MimError('unavailable', `Network error: ${name || 'unknown'}`);
			}
			if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
				current = new URL(response.headers.get('location')!, current).href;
				continue;
			}
			return response;
		}
		throw new MimError('unavailable', 'Too many redirects');
	}

	async function request(url: string, deadline: number): Promise<string> {
		let attempt = 0;
		for (;;) {
			let response: Response | null = null;
			let failure: MimError | null = null;
			try {
				response = await once(url, deadline);
			} catch (error) {
				if (!(error instanceof MimError) || (error.kind !== 'unavailable' && error.kind !== 'timeout')) throw error;
				failure = error;
			}
			const retryable = failure !== null || (response !== null && RETRY_STATUSES.has(response.status));
			if (retryable && attempt < config.retries && Date.now() < deadline) {
				attempt += 1;
				// urllib3 backoff with factor 0.4: no delay before the first retry, then 0.8 s; honour a short Retry-After.
				const retryAfter = Number(response?.headers.get('retry-after'));
				const backoff = attempt <= 1 ? 0 : 400 * 2 ** (attempt - 1);
				const delay = Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff, 5000, Math.max(0, deadline - Date.now()));
				await response?.body?.cancel().catch(() => undefined);
				if (delay) await sleep(delay);
				continue;
			}
			if (failure) throw failure;
			const result = response!;
			if (result.status === 401 || result.status === 403) throw new MimError('auth', `HTTP ${result.status}`);
			if (!result.ok) throw new MimError('http', `HTTP ${result.status}`);
			return readLimited(result, config.maxResponseBytes);
		}
	}

	return {
		getText: request,
		async getJson(url, deadline) {
			const text = await request(url, deadline);
			try {
				return JSON.parse(text);
			} catch {
				throw new MimError('response', 'Response was not JSON');
			}
		}
	};
}
