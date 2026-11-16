import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import CqasV3Section from '../../src/lib/components/cqas/CqasV3Section.svelte';
import { loadReportsV3, parseReportV3 } from '../../src/lib/domain/cqas-v3';
import fixture from '../fixtures/cqas-v3/report.json';

const raw = () => structuredClone(fixture);
const id = fixture.product.explorer_id;
const files = () => ({'/data/cqas-v3/index.json': {schema: 'cqas-report-index/3', contract_status: 'proposed', reports: [{report: 'versions/a.json', explorer_id: id, product_version: fixture.record.product_version}]}, '/data/cqas-v3/versions/a.json': raw()});
describe('native v3 pipeline evidence', () => {
 it('loads producer output unchanged without mandatory geometry', () => {
  const report = parseReportV3(raw());
  expect(report.schema).toBe('cqas-report/3');
  expect(report.record.results[1]?.measurements).toEqual([]);
  const loaded = loadReportsV3(files(), [id]);
  expect(loaded.warnings).toEqual([]);
  expect(loaded.reports[id]).toHaveLength(1);
 });
 it.each(['source', 'value', 'maturity', 'summary', 'wording', 'unknown', 'review', 'method'])('rejects invalid %s', kind => {
  const data = raw();
  if (kind === 'source') data.record.findings[0]!.derived_from = ['00000000-0000-4000-8000-000000000000'];
  if (kind === 'value') (data.record.results[0]!.measurements[0] as unknown as Record<string,unknown>).value = null;
  if (kind === 'maturity') data.record.results[0]!.method.maturity = 'test_double';
  if (kind === 'summary') data.record.summary.results.completed = 999;
  if (kind === 'wording') data.simple.statement = 'Collection-wide compliance established';
  if (kind === 'unknown') (data as unknown as Record<string,unknown>).extra = 1;
  if (kind === 'review') data.data_status = 'reviewed';
  if (kind === 'method') data.record.results[0]!.method.check_version = '9.0.0';
  expect(() => parseReportV3(data)).toThrow();
 });
 it('skips bad files, unsafe paths and unknown catalogue products', () => {
  expect(loadReportsV3(files(), []).warnings).toHaveLength(1);
  const unsafe = files(); unsafe['/data/cqas-v3/index.json'].reports[0]!.report = '../outside.json';
  expect(loadReportsV3(unsafe, [id]).warnings).toHaveLength(1);
  const missing = files(); missing['/data/cqas-v3/index.json'].reports[0]!.report = 'missing.json';
  expect(loadReportsV3(missing, [id]).warnings).toHaveLength(1);
 });
 it('renders missing evidence, maturity and source IDs without geometric placeholders', () => {
  const {body} = render(CqasV3Section, {props: {reports: [parseReportV3(raw())]}});
  expect(body).toContain('Provisional pipeline output');
  expect(body).toContain('reference_unavailable');
  expect(body).toContain(fixture.record.results[0]!.result_id);
  expect(body).toContain('experimental');
  expect(body).not.toContain('radial_rmse');
 });
});
