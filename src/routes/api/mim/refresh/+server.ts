import { json } from '@sveltejs/kit';
import { getMimService } from '$lib/server/mim';
import type { RequestHandler } from './$types';

/** Deliberate "Refresh MIM data": affects the MIM cache only, limited by a cooldown. */
export const POST: RequestHandler = async () => json(await getMimService().refresh(), { headers: { 'cache-control': 'no-store' } });
