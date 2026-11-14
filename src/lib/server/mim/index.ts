/**
 * Process-wide MIM service built from private server environment variables.
 * By default it reads the public CEOS Database API (https://ceos-capabilities.org/api) with no
 * credentials. Optional: MIMS_API_BASE_URL (or "off" to turn MIM off), MIMS_API_KEY (free key,
 * higher rate limits), MIMS_API_USERNAME / MIMS_API_PASSWORD (older authenticated deployments),
 * MIMS_CACHE_TTL_SECONDS, MIMS_REFRESH_COOLDOWN_SECONDS, MIMS_FAILURE_BACKOFF_SECONDS.
 */
import { env } from '$env/dynamic/private';
import { MimService, mimOptionsFromEnv } from './service';

let service: MimService | null = null;

function seconds(value: string | undefined, fallback: number, min: number, max: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function getMimService(): MimService {
	service ??= new MimService({
		...mimOptionsFromEnv(env),
		ttlMs: seconds(env.MIMS_CACHE_TTL_SECONDS, 21_600, 60, 7 * 86_400) * 1000,
		refreshCooldownMs: seconds(env.MIMS_REFRESH_COOLDOWN_SECONDS, 60, 0, 3_600) * 1000,
		failureBackoffMs: seconds(env.MIMS_FAILURE_BACKOFF_SECONDS, 30, 0, 600) * 1000,
		// Server logs record only the error category and a sanitised detail.
		log: (message) => console.warn(message)
	});
	return service;
}

/** Test hook: replace the singleton (used by the end-to-end mock server configuration). */
export function resetMimService(): void {
	service = null;
}
