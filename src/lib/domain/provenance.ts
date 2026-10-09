/**
 * Field-level research-log evidence (`data/ceos_ard_research_log.csv`).
 * Rows are joined to products only by exact (product_id, field_name) pairs.
 */
import type { ProvenanceIndex, ProvenanceRow } from './types';

export const PROVENANCE_COLUMNS = [
	'product_id',
	'official_product_name',
	'field_name',
	'recorded_value',
	'source_title',
	'source_url',
	'source_type',
	'evidence_level',
	'confidence',
	'notes',
	'date_checked'
] as const;

/** RFC 4180 CSV parsing (quoted fields, escaped quotes, CRLF/LF, optional UTF-8 BOM). */
export function parseCsv(text: string): string[][] {
	const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	for (let index = 0; index < input.length; index += 1) {
		const char = input[index]!;
		if (quoted) {
			if (char === '"') {
				if (input[index + 1] === '"') {
					field += '"';
					index += 1;
				} else quoted = false;
			} else field += char;
			continue;
		}
		if (char === '"') quoted = true;
		else if (char === ',') {
			row.push(field);
			field = '';
		} else if (char === '\n' || char === '\r') {
			if (char === '\r' && input[index + 1] === '\n') index += 1;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else field += char;
	}
	if (field !== '' || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((cells) => !(cells.length === 1 && cells[0] === ''));
}

export interface ProvenanceLoadResult {
	index: ProvenanceIndex;
	rowCount: number;
	warnings: string[];
}

export function buildProvenanceIndex(csvText: string): ProvenanceLoadResult {
	const [header, ...rows] = parseCsv(csvText);
	const warnings: string[] = [];
	if (!header || PROVENANCE_COLUMNS.some((column) => !header.includes(column))) {
		throw new Error('Research log has an unexpected header.');
	}
	const position = Object.fromEntries(header.map((name, index) => [name, index]));
	const index: ProvenanceIndex = {};
	const ambiguous = new Set<string>();
	let rowCount = 0;
	for (const cells of rows) {
		const get = (name: (typeof PROVENANCE_COLUMNS)[number]) => cells[position[name]!] ?? '';
		const record: ProvenanceRow = {
			product_id: get('product_id'),
			field_name: get('field_name'),
			recorded_value: get('recorded_value'),
			source_title: get('source_title'),
			source_url: get('source_url'),
			source_type: get('source_type'),
			evidence_level: get('evidence_level'),
			confidence: get('confidence'),
			notes: get('notes'),
			date_checked: get('date_checked')
		};
		if (!record.product_id || !record.field_name) {
			warnings.push('Skipped a research-log row without product_id or field_name.');
			continue;
		}
		const fields = (index[record.product_id] ??= {});
		const key = `${record.product_id}\u0000${record.field_name}`;
		if (ambiguous.has(key)) continue;
		if (fields[record.field_name]) {
			// Ambiguous evidence is not joined.
			warnings.push(`Duplicate research-log rows for ${record.product_id}/${record.field_name}; neither is joined.`);
			delete fields[record.field_name];
			ambiguous.add(key);
			rowCount -= 1;
			continue;
		}
		fields[record.field_name] = record;
		rowCount += 1;
	}
	return { index, rowCount, warnings };
}

/** Research-log field names for product fields that differ in name. */
export const PROVENANCE_FIELD_ALIASES: Record<string, string> = {
	revisit_days: 'nominal_revisit_days',
	revisit_display: 'nominal_revisit_display'
};
