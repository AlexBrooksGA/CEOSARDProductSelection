import validateSeries from './generated/cqas-series-validator.js';
import validateAlerts from './generated/cqas-alerts-validator.js';

export interface Point {result_id:string;product_version:string;acquired:string;status:string;measurement_index:number|null;value:number|null;uncertainty:unknown;reason:{code:string}|null}
interface Source {product_state:string;configuration:{context?:{site?:{id?:string}};params?:unknown;reference_snapshots?:string[]};registration:{collection:string;scene:{acquired:string;platform:string;instrument:string};product_version:{processing:{label:string}};assets:{role:string;pixel_size_m:number|null}[]};result:{result_id:string;product_version:string;check:string;idempotency_key:string;created:string;outcome:string;reason:{code:string}|null;method:{maturity:string;check_version:string};reference:unknown;measurements:{name:string;per:Record<string,string>;unit:string;value:unknown;n_valid:number|null;uncertainty:unknown}[]}}
export interface Segment {id:string;key:Record<string,unknown>&{processing_label:string;check:string;unit:string};observations:Point[];observed_scene_count:number;status:string}
export interface Series {schema:string;scope_note:string;definition:{id:string;collection:string;site:string;check:string;measurement:string;per:Record<string,string>;unit:string;min_scenes:number;max_gap_days:number};sources:Source[];segments:Segment[];markers:{at:string;before_result:string;after_result:string;reasons:string[]}[];summary:{statement:string;status:string;observed_scene_count:number;site_count:number;observation_count:number;gap_count:number;source_result_ids:string[]}}
interface Band {series_id:string;unit:string;limit:number;source:string}
export interface ServiceFact {kind:string;subject:string;observed_at:string;healthy:boolean;evidence:string}
export interface Alerts {schema:string;evaluated_at:string;coverage_note:string;policy:{bands:Band[];stale_after_hours:number};series:Series[];service_observations:ServiceFact[];quality_alerts:{kind:string;series_id:string;segment_id:string;result_ids:string[];observed_change:number;unit:string;band:Band;statement:string}[];service_alerts:{kind:string;subject:string;reason:string;source:ServiceFact}[]}
const canonical = (x:unknown):string => JSON.stringify(x === undefined ? null : x && typeof x==='object' ? Array.isArray(x) ? x.map(v=>JSON.parse(canonical(v))) : Object.fromEntries(Object.entries(x).sort().map(([k,v])=>[k,JSON.parse(canonical(v))])) : x);
const equal=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const insist=(ok:unknown,message:string)=>{if(!ok)throw Error(message)};
const time=(x:string)=>new Date(x).getTime();
const instant=(x:string)=>new Date(x).toISOString().slice(0,19)+'.'+(x.match(/\.(\d+)/)?.[1]??'').padEnd(6,'0')+'Z';
const scope='A C-QAS check describes the scenes and reference comparisons listed. It does not establish collection-wide suitability and is not a CEOS-ARD assessment.';
function signature(s:Source) {
 const r=s.registration;
 return {platform:r.scene.platform,instrument:r.scene.instrument,label:r.product_version.processing.label,method:s.result.method,check:s.result.check,reference:s.result.reference,params:s.configuration.params,context:s.configuration.context,refs:s.configuration.reference_snapshots,assets:r.assets.map(a=>[a.role,a.pixel_size_m]).sort()};
}
export function parseSeries(raw:unknown):Series {
 insist(validateSeries(raw),'Invalid series schema'); const doc=raw as Series; const d=doc.definition;
 insist(doc.scope_note===scope,'Invalid series scope');
 const sources=new Map(doc.sources.map(s=>[s.result.result_id,s]));
 insist(sources.size===doc.sources.length,'Duplicate series sources');
 insist(new Set(doc.sources.map(s=>s.result.idempotency_key)).size===doc.sources.length,'Duplicate task work');
 for(const s of doc.sources){
  insist(s.registration.collection===d.collection && s.configuration.context?.site?.id===d.site && s.result.check.split('@')[0]===d.check,'Wrong series membership');
  insist(s.result.method.maturity!=='test_double' && s.result.method.check_version===s.result.check.split('@')[1],'Invalid source maturity/version');
 }
 const flat=doc.segments.flatMap(s=>s.observations);
 insist(equal(flat.map(p=>p.result_id),doc.sources.map(s=>s.result.result_id)),'Missing or reordered series sources');
 const scenes=new Set<string>(); const contexts=new Map<string,string>();const contextHashes=new Map<string,string>(); let observations=0,gaps=0;
 for(const seg of doc.segments){
  const first=sources.get(seg.observations[0]!.result_id)!; const k=seg.key;
  const context=canonical({params:first.configuration.params,context:first.configuration.context});
  const hash=String(k.context_sha256);
  insist((!contexts.has(hash)||contexts.get(hash)===context)&&(!contextHashes.has(context)||contextHashes.get(context)===hash),'Inconsistent frozen context identity');
  contexts.set(hash,context);contextHashes.set(context,hash);
  insist(equal(k.reference_snapshots,[...(first.configuration.reference_snapshots??[])].sort()),'Invalid reference snapshots');
  insist(k.collection===d.collection&&k.site===d.site&&k.measurement===d.measurement&&equal(k.per,d.per)&&k.unit===d.unit,'Invalid segment selector');
  insist(k.platform===first.registration.scene.platform&&k.instrument===first.registration.scene.instrument&&equal(k.reference,first.result.reference),'Invalid reference or instrument');
  insist(k.processing_label===first.registration.product_version.processing.label && equal(k.method,first.result.method)&&k.check===first.result.check,'Invalid segment identity');
  const distinct=new Set<string>();let previous:Point|undefined;
  for(const p of seg.observations){
   const s=sources.get(p.result_id)!;
   insist(equal(signature(s),signature(first)),'Mixed methods, processing or sampling in segment');
   insist(p.product_version===s.result.product_version && instant(p.acquired)===instant(s.registration.scene.acquired),'Invalid observation identity');
   if(previous)insist(time(p.acquired)>=time(previous.acquired)&&time(p.acquired)-time(previous.acquired)<=d.max_gap_days*86400000,'Invalid chronological connection');
   previous=p;
   const matches=s.result.measurements.map((m,i)=>({m,i})).filter(({m})=>m.name===d.measurement&&equal(m.per,d.per));
   insist(matches.length<=1,'Ambiguous measurement'); const match=matches[0]; let reason:string|null=null;
   if(s.product_state!=='registered')reason='product_not_registered';
   else if(s.result.outcome!=='completed')reason=s.result.reason?.code??'missing_reason';
   else if(!match)reason='measurement_unavailable';
   else if(match.m.unit!==d.unit)reason='unit_mismatch';
   else if(typeof match.m.value!=='number'||!Number.isFinite(match.m.value))reason='non_numeric_measurement';
   else if(match.m.n_valid===0)reason='insufficient_valid_samples';
   if(reason){
    insist(p.status==='gap'&&p.value===null&&p.measurement_index===null&&p.uncertainty===null&&p.reason?.code===reason&&seg.observations.length===1,'Invalid gap or line through gap');gaps++;
   }else{
    insist(p.status==='observed'&&p.measurement_index===match!.i&&p.value===match!.m.value&&equal(p.uncertainty,match!.m.uncertainty)&&p.reason===null,'Untraceable observation');
    observations++;distinct.add(instant(p.acquired));scenes.add(JSON.stringify([s.registration.scene.platform,s.registration.scene.instrument,instant(p.acquired)]));
   }
  }
  const status=distinct.size>=d.min_scenes?'sufficient_observations':distinct.size?'insufficient_observations':'no_valid_observations';
  insist(seg.observed_scene_count===distinct.size&&seg.status===status,'Invalid segment sufficiency');
 }
 insist(new Set(doc.segments.map(s=>s.id)).size===doc.segments.length,'Duplicate segments');
 insist(doc.markers.length===Math.max(0,doc.segments.length-1),'Missing boundary markers');
 doc.markers.forEach((m,i)=>{
  const a=doc.segments[i]!,b=doc.segments[i+1]!,left=a.observations.at(-1)!,right=b.observations[0]!;
  insist(m.before_result===left.result_id&&m.after_result===right.result_id&&time(m.at)===time(right.acquired)&&time(right.acquired)>=time(left.acquired),'Invalid boundary marker');
  const reasons=Object.keys(a.key).filter(k=>!equal(a.key[k],b.key[k])).map(k=>k+'_changed');
  if(time(right.acquired)-time(left.acquired)>d.max_gap_days*86400000)reasons.push('observation_interval_exceeded');
  if(left.status==='gap'||right.status==='gap')reasons.push('unassessed_gap');
  insist(reasons.length&&equal([...reasons].sort(),[...m.reasons].sort()),'Invalid boundary reason');
 });
 const n=scenes.size,sites=Number(n>0),status=doc.segments.some(s=>s.status==='sufficient_observations')?'sufficient_observations':n?'insufficient_observations':'no_valid_observations';
 const statement=`Observed measurements over ${n} ${n===1?'scene':'scenes'} at ${sites} ${sites===1?'site':'sites'}. ${observations} observations and ${gaps} gaps. Observation sufficiency is reported separately for each segment.`;
 insist(equal(doc.summary,{statement,status,observed_scene_count:n,site_count:sites,observation_count:observations,gap_count:gaps,source_result_ids:[...sources.keys()].sort()}),'Invalid series summary');
 return doc;
}
export function parseAlerts(raw:unknown):Alerts{
 insist(validateAlerts(raw),'Invalid alert schema');const doc=raw as Alerts;
 const series=new Map(doc.series.map(s=>{parseSeries(s);return [s.definition.id,s]}));
 insist(series.size===doc.series.length,'Duplicate alert series');
 insist(new Set(doc.policy.bands.map(b=>b.series_id)).size===doc.policy.bands.length,'Duplicate band');
 const quality:Alerts['quality_alerts']=[];
 for(const band of [...doc.policy.bands].sort((a,b)=>a.series_id<b.series_id?-1:1)){
  const s=series.get(band.series_id);insist(s&&s.definition.unit===band.unit,'Invalid band series or unit');
  insist(s!.sources.every(x=>time(x.registration.scene.acquired)<=time(doc.evaluated_at)&&time(x.result.created)<=time(doc.evaluated_at)),'Future series evidence');
  const seg=s!.segments.at(-1);if(!seg||seg.status!=='sufficient_observations')continue;
  const [a,b]=seg.observations.slice(-2);insist(a&&b&&a.value!==null&&b.value!==null,'Invalid alert pair');
  const delta=Math.abs(b!.value!-a!.value!);
  if(instant(a!.acquired)!==instant(b!.acquired)&&delta>band.limit)quality.push({kind:'quality',series_id:band.series_id,segment_id:seg.id,result_ids:[a!.result_id,b!.result_id],observed_change:delta,unit:band.unit,band,statement:'Observed change exceeds the configured advisory band.'});
 }
 const latest=new Map<string,ServiceFact>();
 for(const fact of doc.service_observations){
  insist(time(fact.observed_at)<=time(doc.evaluated_at),'Future service evidence');
  insist(fact.kind!=='schedule'||fact.healthy,'Failed schedule heartbeat');
  const k=JSON.stringify([fact.kind,fact.subject]),old=latest.get(k);
  if(old&&time(old.observed_at)===time(fact.observed_at))insist(equal(old,fact),'Conflicting service evidence');
  if(!old||time(fact.observed_at)>time(old.observed_at))latest.set(k,fact);
 }
 const services:Alerts['service_alerts']=[];
 for(const [,fact]of [...latest].sort(([a],[b])=>a<b?-1:1)){
  const reason=fact.kind==='schedule'?(time(doc.evaluated_at)-time(fact.observed_at)>doc.policy.stale_after_hours*3600000?'stale_schedule':null):!fact.healthy?(fact.kind==='task'?'task_failure':'provider_unavailable'):null;
  if(reason)services.push({kind:'service',subject:fact.subject,reason,source:fact});
 }
 insist(equal(doc.quality_alerts,quality)&&equal(doc.service_alerts,services),'Untraceable alert projection');return doc;
}

export function loadSidecars(files:Record<string,unknown>,known:Iterable<string>){
 const seen=new Set<string>();
 const ids=new Set(known),series:Record<string,Series[]>={},alerts:Alerts[]=[],warnings:string[]=[];
 function index(path:string,schema:string):Record<string,unknown>|null{
  const raw=files[path];if(raw===undefined)return null;
  if(!raw||typeof raw!=='object'||!('schema'in raw)||raw.schema!==schema){warnings.push('Invalid monitoring index');return null;}return raw as Record<string,unknown>;
 }
 function read(root:string,path:unknown){insist(typeof path==='string'&&/^[A-Za-z0-9._/-]+\.json$/.test(path)&&!path.startsWith('/')&&!path.split('/').some(p=>p==='..'||p==='.'),'Unsafe sidecar path');return files[root+path];}
 const publication=index('/data/cqas-v3/index.json','cqas-report-index/3');
 if(publication&&Array.isArray(publication.series))for(const entry of publication.series){try{
  const s=parseSeries(read('/data/cqas-v3/',entry.series));
  insist(ids.has(entry.explorer_id)&&entry.id===s.definition.id&&entry.collection===s.definition.collection&&entry.site===s.definition.site,'Invalid series binding');
  insist(!seen.has(s.definition.id),'Duplicate indexed series');seen.add(s.definition.id);
  const list=series[entry.explorer_id]??=[];list.push(s);
 }catch(e){warnings.push(e instanceof Error?e.message:'Invalid series');}}
 const alertIndex=index('/data/cqas-alerts/index.json','cqas-alert-index/1');
 if(alertIndex)try{alerts.push(parseAlerts(read('/data/cqas-alerts/',alertIndex.alerts)));}catch(e){warnings.push(e instanceof Error?e.message:'Invalid alerts');}
 return {series,alerts,warnings};
}

/** A series ID alone cannot attribute an alert to a product/collection. */
export function relatedQuality(id:string, series:Series[], snapshot:Alerts):boolean {
 const own=series.find(s=>s.definition.id===id),embedded=snapshot.series.find(s=>s.definition.id===id);
 if(!own||!embedded)return false;
 const select=(s:Series)=>({collection:s.definition.collection,site:s.definition.site,check:s.definition.check,measurement:s.definition.measurement,per:s.definition.per,unit:s.definition.unit});
 return equal(select(own),select(embedded));
}
