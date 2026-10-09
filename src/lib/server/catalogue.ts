/**
 * Bundled catalogue, profiles, research log and agency marks. Server-only.
 *
 * Files are bundled at build time with `import.meta.glob`, so the deployed Node app needs
 * no data directory at runtime. File *presence* still decides precedence exactly as the
 * prototype did: the researched catalogue wins; demo + status overlay is a fallback only.
 */
import { CatalogueError, loadCatalogue, loadProfiles, type CatalogueLoadResult } from '$lib/domain/catalogue';
import { buildProvenanceIndex } from '$lib/domain/provenance';
import type { Product, Profile, ProvenanceIndex } from '$lib/domain/types';

const jsonFiles = import.meta.glob('/data/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const csvFiles = import.meta.glob('/data/*.csv', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const logoFiles = import.meta.glob('/assets/agency_logos/*.{png,svg,jpg,webp,ico}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const logoManifest = import.meta.glob('/assets/agency_logos/manifest.json', { eager: true, import: 'default' }) as Record<string, { agencies?: Record<string, { file?: string; display_treatment?: string }> }>;

export interface BundledData {
	catalogue: CatalogueLoadResult;
	profiles: Profile[];
	provenance: ProvenanceIndex;
	provenanceWarnings: string[];
	agencyMarks: Record<string, { url: string; monochrome: boolean }>;
}

let cached: { data: BundledData } | { error: string } | null = null;

function build(): BundledData {
	const catalogue = loadCatalogue({
		researched: jsonFiles['/data/ceos_ard_products.json'],
		demo: jsonFiles['/data/demo_products.json'],
		status: jsonFiles['/data/ceos_ard_status.json']
	});
	const rawProfiles = jsonFiles['/data/default_profiles.json'];
	if (rawProfiles === undefined) throw new CatalogueError('Required data file is missing: default_profiles.json');
	const profiles = loadProfiles(rawProfiles);
	if (!profiles.length) throw new CatalogueError('No built-in profiles are available.');
	const csv = csvFiles['/data/ceos_ard_research_log.csv'];
	const log = csv ? buildProvenanceIndex(csv) : { index: {}, rowCount: 0, warnings: ['Research log is missing; field-level provenance is unavailable.'] };
	const known = new Set(catalogue.products.map((product) => product.id));
	const provenance: ProvenanceIndex = Object.fromEntries(Object.entries(log.index).filter(([id]) => known.has(id)));
	const manifest = Object.values(logoManifest)[0]?.agencies ?? {};
	const agencyMarks: BundledData['agencyMarks'] = {};
	for (const [agency, record] of Object.entries(manifest)) {
		const url = record.file ? logoFiles[`/assets/agency_logos/${record.file}`] : undefined;
		if (url) agencyMarks[agency] = { url, monochrome: record.display_treatment === 'monochrome-dark' };
	}
	return { catalogue, profiles, provenance, provenanceWarnings: log.warnings, agencyMarks };
}

/** Validated bundled data, or a clear error message when the bundled files are unusable. */
export function bundledData(): { data: BundledData } | { error: string } {
	if (!cached) {
		try {
			cached = { data: build() };
			for (const warning of [...cached.data.catalogue.warnings, ...cached.data.provenanceWarnings]) console.warn(`Catalogue: ${warning}`);
		} catch (error) {
			cached = { error: error instanceof CatalogueError ? error.message : 'The bundled catalogue could not be loaded.' };
			console.error(`Catalogue: ${(cached as { error: string }).error}`);
		}
	}
	return cached;
}

export function productById(id: string): Product | undefined {
	const result = bundledData();
	return 'data' in result ? result.data.catalogue.products.find((product) => product.id === id) : undefined;
}
