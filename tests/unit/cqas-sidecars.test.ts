import {describe,expect,it} from 'vitest';
import {render} from 'svelte/server';
import {parseSeries,parseAlerts,loadSidecars, type Series, type Alerts, relatedQuality} from '../../src/lib/domain/cqas-sidecars';
import CqasMonitoring from '../../src/lib/components/cqas/CqasMonitoring.svelte';
import series from '../fixtures/cqas-v3/series.json';
import alerts from '../fixtures/cqas-v3/alerts.json';
const s=()=>structuredClone(series) as Series,a=()=>structuredClone(alerts) as Alerts;
describe('series and alert evidence',()=>{
 it('accepts unchanged producer sidecars and retains gaps and uncertainty',()=>{
  const doc=parseSeries(s());expect(doc.segments).toHaveLength(3);expect(doc.markers).toHaveLength(2);
  expect(doc.segments[1]!.observations[0]!.value).toBeNull();expect(parseAlerts(a()).quality_alerts).toHaveLength(1);
 });
 it.each(['value','result','summary','join','maturity','marker','reason','scope'])('rejects forged series %s',kind=>{
  const doc=s();
  if(kind==='value')doc.segments[0]!.observations[0]!.value=999;
  if(kind==='result')doc.segments[0]!.observations[0]!.result_id='00000000-0000-4000-8000-000000000000';
  if(kind==='summary')doc.summary.observed_scene_count=999;
  if(kind==='join'){doc.segments[0]!.observations.push(...doc.segments.pop()!.observations);}
  if(kind==='maturity')doc.sources[0]!.result.method.maturity='test_double';
  if(kind==='marker')doc.markers=[];
  if(kind==='reason')doc.segments[1]!.observations[0]!.reason!.code='forged';
  if(kind==='scope')doc.scope_note='Collection-wide compliance established';
  expect(()=>parseSeries(doc)).toThrow();
 });
 it.each(['delta','ids','band','service','future','recovery'])('rejects forged alert %s',kind=>{
  const doc=a();
  if(kind==='delta')doc.quality_alerts[0]!.observed_change=999;
  if(kind==='ids')doc.quality_alerts[0]!.result_ids.reverse();
  if(kind==='band')doc.policy.bands[0]!.unit='m';
  if(kind==='service')doc.service_alerts[0]!.reason='task_failure';
  if(kind==='future')doc.evaluated_at='2000-01-01T00:00:00Z';
  if(kind==='recovery')doc.service_observations[0]!.healthy=true;
  expect(()=>parseAlerts(doc)).toThrow();
 });
 it('loads indexed sidecars, refuses traversal/bad bindings and tolerates missing files',()=>{
  const files:Record<string,unknown>={
   '/data/cqas-v3/index.json':{schema:'cqas-report-index/3',series:[{id:series.definition.id,collection:series.definition.collection,site:series.definition.site,explorer_id:'sentinel2-level2a',series:'series/test.json'}]},
   '/data/cqas-v3/series/test.json':s(),
   '/data/cqas-alerts/index.json':{schema:'cqas-alert-index/1',alerts:'snapshots/test.json'},
   '/data/cqas-alerts/snapshots/test.json':a()
  };
  const loaded=loadSidecars(files,['sentinel2-level2a']);expect(loaded.warnings).toEqual([]);expect(loaded.alerts).toHaveLength(1);
  expect(loadSidecars(files,[]).warnings).toHaveLength(1);
  const unsafe={...files,'/data/cqas-alerts/index.json':{schema:'cqas-alert-index/1',alerts:'../outside.json'}};
  expect(loadSidecars(unsafe,['sentinel2-level2a']).warnings).toHaveLength(1);
  expect(loadSidecars({},[])).toEqual({series:{},alerts:[],warnings:[]});
 });
 it('renders null gaps, separate segments and independently sourced service alerts',()=>{
  const {body}=render(CqasMonitoring,{props:{series:[parseSeries(s())],alerts:[parseAlerts(a())],services:true}});
  expect(body).toContain('reference_unavailable');expect(body).toContain('Separate segment');expect(body).toContain('—');
  expect(body).toContain(series.sources[0]!.result.result_id);expect(body).toContain('provider unavailable');
  expect(body).toContain('Service coverage is limited');
 });
 it('does not expose global services in a product-scoped panel or infer health from missing inputs',()=>{
  const {body}=render(CqasMonitoring,{props:{series:[parseSeries(s())],alerts:[parseAlerts(a())]}});
  expect(body).not.toContain('Synthetic provider');
  const empty=render(CqasMonitoring,{props:{}}).body;expect(empty).toContain('No published series');expect(empty).not.toContain('healthy');
 });
});

it('does not attribute a same-named series from a different collection to a product',()=>{
 const own=parseSeries(s()),snapshot=parseAlerts(a());own.definition.collection='another.collection';
 expect(relatedQuality(own.definition.id,[own],snapshot)).toBe(false);
});

it('preserves microsecond ordering at segment boundaries',()=>{
 const doc=s(),later='2026-11-14T12:00:00.000002Z',earlier='2026-11-14T12:00:00.000001Z';
 doc.sources[0]!.registration.scene.acquired=later;doc.segments[0]!.observations[0]!.acquired=later;
 doc.sources[1]!.registration.scene.acquired=earlier;doc.segments[1]!.observations[0]!.acquired=earlier;doc.markers[0]!.at=earlier;
 expect(()=>parseSeries(doc)).toThrow('Invalid boundary marker');
});


it('accepts equivalent timezone service evidence and projection spellings',()=>{
 const doc=a(),fact=doc.service_observations[0]!;
 const equivalent={...fact,observed_at:new Date(new Date(fact.observed_at).getTime()+3600000).toISOString().replace('Z','+01:00')};
 doc.service_observations.push(equivalent);
 doc.service_alerts[0]!.source=equivalent;
 expect(parseAlerts(doc).service_alerts).toHaveLength(1);
});

it.each([false,true])('rejects historical service conflicts regardless of order (newest first: %s)',newestFirst=>{
 const doc=a(),fact=doc.service_observations[0]!,conflict={...fact,healthy:!fact.healthy};
 const newer={...fact,observed_at:doc.evaluated_at};
 doc.service_observations=newestFirst?[newer,fact,conflict]:[fact,conflict,newer];
 expect(()=>parseAlerts(doc)).toThrow('Conflicting service evidence');
});
