import { json } from '@sveltejs/kit';
import { getMimService } from '$lib/server/mim';
import type { RequestHandler } from './$types';

/** Sanitised status only; never contacts the upstream service. */
export const GET: RequestHandler = () => json({ status: getMimService().status() }, { headers: { 'cache-control': 'no-store' } });
