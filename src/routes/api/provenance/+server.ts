import { error, json } from '@sveltejs/kit';
import { PRODUCT_ID_PATTERN } from '$lib/domain/catalogue';
import { bundledData } from '$lib/server/catalogue';
import type { RequestHandler } from './$types';

/** Field-level research-log evidence for up to 60 curated product IDs. */
export const GET: RequestHandler = ({ url }) => {
	const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
	if (ids.length > 60 || ids.some((id) => !PRODUCT_ID_PATTERN.test(id))) error(400, 'Invalid product identifiers.');
	const result = bundledData();
	if ('error' in result) error(503, 'Catalogue unavailable.');
	const provenance = Object.fromEntries(ids.filter((id) => result.data.provenance[id]).map((id) => [id, result.data.provenance[id]]));
	return json({ provenance }, { headers: { 'cache-control': 'public, max-age=300' } });
};
