import { json } from '@sveltejs/kit';
import { getMimService } from '$lib/server/mim';
import type { RequestHandler } from './$types';

/**
 * Deliberate "Load MIM products". Serves the fresh process cache when available.
 * `cachedOnly` (used when a session is restored) never contacts the upstream service.
 * The browser never supplies credentials or upstream URLs.
 */
export const POST: RequestHandler = async ({ request }) => {
	let cachedOnly = false;
	try {
		const body = (await request.json()) as { cachedOnly?: unknown };
		cachedOnly = body?.cachedOnly === true;
	} catch {
		cachedOnly = false;
	}
	const result = await getMimService().load({ cachedOnly });
	return json(result, { headers: { 'cache-control': 'no-store' } });
};
