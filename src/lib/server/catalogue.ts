/**
 * Bundled catalogue, profiles, research log and agency marks. Server-only.
 *
 * Files are bundled at build time with `import.meta.glob`, so the deployed Node app needs
 * no data directory at runtime. File *presence* still decides precedence exactly as the
 * prototype did: the researched catalogue wins; demo + status overlay is a fallback only.
 */
import { CatalogueError, loadCatalogue, loadProfiles, type CatalogueLoadResult } from '$lib/domain/catalogue';
import { loadCqasReports, type CqasReport } from '$lib/domain/cqas';
import { mimDetailsFor, MimSnapshotError, mimSummary, parseMimSnapshot, productVisual, type MimCredit, type MimSnapshot, type MimSummary, type MissionVisual, type ProductVisual } from '$lib/domain/mim';
import { buildProvenanceIndex } from '$lib/domain/provenance';
import type { Product, Profile, ProvenanceIndex } from '$lib/domain/types';

const jsonFiles = import.meta.glob('/data/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const csvFiles = import.meta.glob('/data/*.csv', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
// C-QAS reports (cqas-report/1), one file per product: data/cqas/<product-id>.json.
const cqasFiles = import.meta.glob('/data/cqas/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
// CEOS MIM database snapshot for curated products (tools/build_mim_snapshot.mjs).
const mimFiles = import.meta.glob('/data/mim/snapshot.json', { eager: true, import: 'default' }) as Record<string, unknown>;
// Vendored mission icons and credited pictures (tools/fetch_mission_visuals.mjs).
const visualFiles = import.meta.glob('/assets/mission_visuals/*.{png,svg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const visualManifest = import.meta.glob('/assets/mission_visuals/manifest.json', { eager: true, import: 'default' }) as Record<string, { missions?: Record<string, { acronym?: string | null; icon?: string; image?: string | null; image_credit?: MimCredit | null }> }>;
const logoFiles = import.meta.glob('/assets/agency_logos/*.{png,svg,jpg,webp,ico}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const logoManifest = import.meta.glob('/assets/agency_logos/manifest.json', { eager: true, import: 'default' }) as Record<string, { agencies?: Record<string, { file?: string; display_treatment?: string }> }>;

export interface BundledData {
	catalogue: CatalogueLoadResult;
	profiles: Profile[];
	provenance: ProvenanceIndex;
	provenanceWarnings: string[];
	agencyMarks: Record<string, { url: string; monochrome: boolean }>;
	/** C-QAS reports keyed by product ID. Example data until C-QAS produces real reports. */
	cqasReports: Record<string, CqasReport>;
	cqasWarnings: string[];
	/** MIM snapshot, or null when absent or invalid (MIM facts are then simply not shown). */
	mimSnapshot: MimSnapshot | null;
	/** Compact MIM facts by curated product ID, for lists and comparison. */
	mimSummaries: Record<string, MimSummary>;
	/** Vendored pictures by mission ID, and the one shown for each curated product. */
	missionVisuals: Record<string, MissionVisual>;
	productVisuals: Record<string, ProductVisual>;
	mimWarnings: string[];
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
	// A bad C-QAS file is skipped with a warning; it never takes down discovery or matching.
	const cqas = loadCqasReports(cqasFiles, known);
	// Like C-QAS, a bad MIM snapshot is skipped with a warning; it never stops the explorer.
	let mimSnapshot: MimSnapshot | null = null;
	const mimWarnings: string[] = [];
	const rawSnapshot = mimFiles['/data/mim/snapshot.json'];
	if (rawSnapshot !== undefined) {
		try {
			mimSnapshot = parseMimSnapshot(rawSnapshot, known);
		} catch (error) {
			mimWarnings.push(error instanceof MimSnapshotError ? error.message : 'MIM snapshot could not be read.');
		}
	}
	const missionVisuals: Record<string, MissionVisual> = {};
	for (const [id, entry] of Object.entries(Object.values(visualManifest)[0]?.missions ?? {})) {
		const icon = entry.icon ? visualFiles[`/assets/mission_visuals/${entry.icon}`] : undefined;
		if (!icon) continue;
		const image = entry.image ? (visualFiles[`/assets/mission_visuals/${entry.image}`] ?? null) : null;
		missionVisuals[id] = { mission_id: Number(id), acronym: entry.acronym ?? null, icon, image, credit: image ? (entry.image_credit ?? null) : null };
	}
	const mimSummaries: Record<string, MimSummary> = {};
	const productVisuals: Record<string, ProductVisual> = {};
	for (const product of catalogue.products) {
		const details = mimDetailsFor(mimSnapshot, product.id);
		if (details) mimSummaries[product.id] = mimSummary(details);
		const visual = productVisual(details, missionVisuals);
		if (visual) productVisuals[product.id] = visual;
	}
	return { catalogue, profiles, provenance, provenanceWarnings: log.warnings, agencyMarks, cqasReports: cqas.reports, cqasWarnings: cqas.warnings, mimSnapshot, mimSummaries, missionVisuals, productVisuals, mimWarnings };
}

/** Validated bundled data, or a clear error message when the bundled files are unusable. */
export function bundledData(): { data: BundledData } | { error: string } {
	if (!cached) {
		try {
			cached = { data: build() };
			for (const warning of [...cached.data.catalogue.warnings, ...cached.data.provenanceWarnings, ...cached.data.cqasWarnings, ...cached.data.mimWarnings]) console.warn(`Catalogue: ${warning}`);
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
