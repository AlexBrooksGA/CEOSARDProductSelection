/**
 * Authenticated OpenAPI inspection — a port of legacy `inspect_openapi`,
 * `_collection_path` and `_server_root`, with trusted-origin restrictions added.
 */
import { MimError } from './errors';

type Json = Record<string, unknown>;

export const DOCS_SCHEMA_PATTERN = /(?:url|spec-url)\s*[:=]\s*['"]([^'"]+)/i;

/** The schema URL declared by Swagger UI (`url:` or `spec-url=`). */
export function declaredSchemaUrl(html: string): string | null {
	return DOCS_SCHEMA_PATTERN.exec(html)?.[1] ?? null;
}

interface Operation {
	path: string;
	operation: Json;
	text: string;
}

function getOperations(schema: Json, { excludeTemplated }: { excludeTemplated: boolean }): Operation[] {
	const paths = schema.paths;
	if (!paths || typeof paths !== 'object' || Array.isArray(paths)) return [];
	const operations: Operation[] = [];
	for (const [path, methods] of Object.entries(paths as Json)) {
		if (excludeTemplated && path.includes('{')) continue;
		if (!methods || typeof methods !== 'object' || Array.isArray(methods)) continue;
		const get = (methods as Json).get;
		if (!get || typeof get !== 'object' || Array.isArray(get)) continue;
		const operation = get as Json;
		const tags = Array.isArray(operation.tags) ? operation.tags.map(String).join(' ') : '';
		const text = [path, String(operation.operationId ?? ''), String(operation.summary ?? ''), tags].join(' ').toLowerCase();
		operations.push({ path, operation, text });
	}
	return operations;
}

function bestCandidate(candidates: [number, string, Json?][]): [number, string, Json?] {
	candidates.sort((a, b) => b[0] - a[0] || a[1].length - b[1].length || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
	return candidates[0]!;
}

export interface MissionInspection {
	missionPath: string;
	missionParameters: string[];
}

/**
 * The prototype required a mission collection to be identifiable before it would load
 * products (an unobvious coupling preserved for parity; see docs/rebuild/AUDIT.md §5).
 */
export function findMissionEndpoint(schema: Json): MissionInspection {
	const candidates: [number, string, Json][] = [];
	for (const { path, operation, text } of getOperations(schema, { excludeTemplated: false })) {
		let score = /\bmissions?\b/.test(text) ? 3 : 0;
		if (/\b(instruments?|measurements?)\b/.test(text)) score -= 2;
		if (score > 0) candidates.push([score, path, operation]);
	}
	if (!candidates.length) throw new MimError('schema', 'No mission collection endpoint was identified in the authenticated schema.');
	const [, missionPath, operation] = bestCandidate(candidates);
	const parameters = Array.isArray(operation?.parameters) ? operation!.parameters : [];
	return {
		missionPath,
		missionParameters: parameters.filter((item): item is Json => Boolean(item) && typeof item === 'object' && Boolean((item as Json).name)).map((item) => String(item.name))
	};
}

/** Locate a top-level collection GET endpoint from the authenticated schema. */
export function collectionPath(schema: Json, collection: 'products' | 'instruments'): string {
	const singular = collection.replace(/s$/, '');
	const candidates: [number, string][] = [];
	for (const { path, text } of getOperations(schema, { excludeTemplated: true })) {
		let score = path.toLowerCase().replace(/\/+$/, '').endsWith(`/${collection}`) ? 4 : 0;
		if (new RegExp(`\\b${singular}s?\\b`).test(text)) score += 2;
		if (score) candidates.push([score, path]);
	}
	if (!candidates.length) throw new MimError('schema', `No ${collection} collection endpoint was identified in the authenticated schema.`);
	return bestCandidate(candidates)[1];
}

/** Port of `_server_root`: the schema's first server URL (resolved against the schema URL), else the base URL. */
export function serverRoot(schema: Json, schemaUrl: string, baseUrl: string): string {
	const servers = schema.servers;
	if (Array.isArray(servers) && servers.length && servers[0] && typeof servers[0] === 'object' && typeof (servers[0] as Json).url === 'string') {
		return new URL((servers[0] as Json).url as string, schemaUrl).href.replace(/\/+$/, '') + '/';
	}
	return baseUrl.replace(/\/+$/, '') + '/';
}

export function joinPath(root: string, path: string): string {
	return new URL(path.replace(/^\/+/, ''), root).href;
}
