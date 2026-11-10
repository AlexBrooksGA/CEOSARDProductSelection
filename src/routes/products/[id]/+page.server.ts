import { PRODUCT_ID_PATTERN } from '$lib/domain/catalogue';
import { bundledData } from '$lib/server/catalogue';
import { getMimService } from '$lib/server/mim';
import { mimDetailsFor } from '$lib/domain/mim';
import type { PageServerLoad } from './$types';

/** Provenance for curated records, and a cached MIM record when the server already holds one (never fetches upstream). */
export const load: PageServerLoad = async ({ params }) => {
	const id = params.id;
	if (!PRODUCT_ID_PATTERN.test(id)) return { id, valid: false, provenance: null, mimProduct: null, mimDetails: null, missionVisuals: {} };
	const result = bundledData();
	const provenance = 'data' in result ? (result.data.provenance[id] ?? null) : null;
	let mimProduct = null;
	if (id.startsWith('mim-product:')) {
		const cached = await getMimService().load({ cachedOnly: true });
		mimProduct = cached.products?.find((product) => product.id === id) ?? null;
	}
	// Full CEOS MIM database details for a curated product (snapshot; never fetched live here).
	const mimDetails = 'data' in result ? mimDetailsFor(result.data.mimSnapshot, id) : null;
	const allVisuals = 'data' in result ? result.data.missionVisuals : {};
	const missionVisuals = Object.fromEntries((mimDetails?.missions ?? []).filter((m) => allVisuals[String(m.mission_id)]).map((m) => [String(m.mission_id), allVisuals[String(m.mission_id)]!]));
	return { id, valid: true, provenance, mimProduct, mimDetails, missionVisuals };
};
