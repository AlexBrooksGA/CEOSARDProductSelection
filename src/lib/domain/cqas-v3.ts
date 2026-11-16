/** Version 3 is kept separate from the legacy geometric/radiometric projection. */
import validate from './generated/cqas-v3-validator.js';

export interface ReportV3 {
 schema: 'cqas-report/3'; contract_status: 'proposed'; data_status: 'provisional';
 product: { explorer_id: string; name: string; short_name: string };
 simple: {statement: string; scene_count: number; result_count: number; finding_count: number;
 source_result_ids: string[]; source_finding_ids: string[]};
 record: { product_version: string; generated_at: string; scope_note: string; status_note: string;
 product_state: string; registration: {scene: {acquired: string}; product_version: {provider_id: string; processing: {label: string}}};
 basis: {rulesets: string[]} | null;
 summary: {results: Record<string, number>; findings: Record<string, number>; maturity: Record<string, number>};
 results: {result_id: string; product_version: string; check: string; outcome: string;
 reason: unknown; method: {maturity: string; check_version: string};
 measurements: {name: string; per: Record<string,string>; value: string | number | boolean; unit: string; uncertainty: unknown}[]}[];
 findings: {finding_id: string; requirement: string; title: string; level: string; outcome: string;
 review_state: string; derived_from: string[]; reason: unknown}[];
 };
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const count = (values: string[]) => Object.fromEntries([...new Set(values)].sort().map(v => [v, values.filter(x => x === v).length]));
function countsEqual(a: Record<string, number>, b: Record<string, number>) {
 return equal(Object.entries(a).sort(), Object.entries(b).sort());
}
export function parseReportV3(raw: unknown): ReportV3 {
 if (!validate(raw)) throw Error(`Invalid cqas-report/3: ${JSON.stringify(validate.errors)}`);
 const r = raw.record;
 if (r.status_note !== "Provisional. Produced by C-QAS and not reviewed. A result from an experimental check cannot establish a requirement, so a finding is 'not assessed' until its checks are validated, whatever they measured." || r.scope_note !== "A C-QAS check describes the scenes and reference comparisons listed. It does not establish collection-wide suitability and is not a CEOS-ARD assessment.") throw Error("Noncanonical scope/status wording");
 const results = new Map(r.results.map(x => [x.result_id, x]));
 const findings = new Set(r.findings.map(x => x.finding_id));
 if (results.size !== r.results.length || findings.size !== r.findings.length) throw Error('Duplicate source identity');
 if (r.results.some(x => x.product_version !== r.product_version || x.method.maturity === 'test_double')) throw Error('Invalid result identity or maturity');
 for (const result of r.results) {
  if (result.check.split('@')[1] !== result.method.check_version) throw Error('Inconsistent method version');
  if (result.outcome !== 'completed' && (!result.reason || result.measurements.length)) throw Error('Invalid unassessed result');
  if (result.outcome === 'completed' && result.reason !== null) throw Error('Completed result carries a reason');
 }
 const levels = new Set(r.findings.map(f => `${f.requirement}:${f.level}`));
 if (levels.size !== r.findings.length) throw Error('Duplicate requirement level');
 if (r.findings.length && (!r.basis || r.basis.rulesets.length !== 1)) throw Error('Ambiguous finding basis');
 for (const f of r.findings) {
  if (f.derived_from.some(id => !results.has(id))) throw Error('Missing finding source');
  if (f.review_state === 'reviewed') throw Error('Review workflow not adopted');
  if (['met','not_met'].includes(f.outcome) && (!f.derived_from.length || f.derived_from.some(id => {
   const source = results.get(id)!; return source.outcome !== 'completed' || source.method.maturity !== 'operational';
  }))) throw Error('Decisive finding lacks operational completed evidence');
  if (!['met','not_met'].includes(f.outcome) && f.reason === null) throw Error('Finding lacks reason');
  if (f.outcome === 'met' && f.reason !== null) throw Error('Met finding carries an open reason');
 }
 if (!countsEqual(r.summary.results, count(r.results.map(x => x.outcome))) ||
     !countsEqual(r.summary.findings, count(r.findings.map(x => x.outcome))) ||
     !countsEqual(r.summary.maturity, count(r.results.map(x => x.method.maturity)))) throw Error('Forged summary');
 const expected = `Observed results for 1 scene: ${r.results.length} check results and ${r.findings.length} requirement-level findings. See each result's outcome, maturity and assessment reason.`;
 if (raw.simple.statement !== expected || raw.simple.scene_count !== 1 || raw.simple.result_count !== results.size || raw.simple.finding_count !== findings.size ||
 !equal(raw.simple.source_result_ids, [...results.keys()].sort()) || !equal(raw.simple.source_finding_ids, [...findings].sort())) throw Error('Forged simple view');
 return raw;
}

/** Index references select immutable versions; never silently replace a product's other versions. */
export function loadReportsV3(files: Record<string, unknown>, known: Iterable<string>) {
 const reports: Record<string, ReportV3[]> = {}; const warnings: string[] = [];
 const ids = new Set(known);
 const index = files['/data/cqas-v3/index.json'];
 if (index === undefined) return {reports, warnings};
 if (!index || typeof index !== 'object' || !('schema' in index) || index.schema !== 'cqas-report-index/3' || !('contract_status' in index) || index.contract_status !== 'proposed' || !('reports' in index) || !Array.isArray(index.reports)) return {reports, warnings: ['Invalid v3 publication index']};
 const versions = new Set<string>();
 for (const entry of index.reports) {
  try {
   if (!entry || typeof entry !== 'object' || typeof entry.report !== 'string' || !/^[A-Za-z0-9._:/-]+\.json$/.test(entry.report) || entry.report.startsWith('/') || entry.report.split('/').some((p: string) => p === '..' || p === '.')) throw Error('Unsafe publication path');
   const report = parseReportV3(files['/data/cqas-v3/' + entry.report]);
   if (!ids.has(report.product.explorer_id) || entry.explorer_id !== report.product.explorer_id || entry.product_version !== report.record.product_version) throw Error('Unknown or mismatched product binding');
   if (versions.has(report.record.product_version)) throw Error('Duplicate product version');
   versions.add(report.record.product_version);
   (reports[report.product.explorer_id] ??= []).push(report);
  } catch (e) { warnings.push(e instanceof Error ? e.message : 'Invalid v3 publication'); }
 }
 for (const list of Object.values(reports)) list.sort((a,b) => a.record.product_version.localeCompare(b.record.product_version));
 return {reports, warnings};
}
