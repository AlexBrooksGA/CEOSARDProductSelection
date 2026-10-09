import { error } from '@sveltejs/kit';
import { bundledData } from '$lib/server/catalogue';
import { getMimService } from '$lib/server/mim';
import type { LayoutServerLoad } from './$types';

// The layout does not read the URL, so client-side state changes never re-run it.
export const load: LayoutServerLoad = () => {
	const result = bundledData();
	if ('error' in result) error(500, `The bundled catalogue could not be loaded: ${result.error}`);
	const { data } = result;
	return {
		products: data.catalogue.products,
		profiles: data.profiles,
		agencyMarks: data.agencyMarks,
		// Compact missing-state evidence so cards use the same wording as details: field → date checked.
		notFound: Object.fromEntries(
			Object.entries(data.provenance).map(([id, fields]) => [id, Object.fromEntries(Object.values(fields).filter((row) => row.confidence === 'not_found').map((row) => [row.field_name, row.date_checked]))])
		) as Record<string, Record<string, string>>,
		catalogueSource: data.catalogue.source,
		mim: getMimService().status()
	};
};
