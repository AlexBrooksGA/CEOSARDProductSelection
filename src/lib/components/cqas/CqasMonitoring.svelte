<script lang="ts">
 import { relatedQuality, type Series, type Alerts } from '$lib/domain/cqas-sidecars';
 let { series = [], alerts = [], services = false }: {series?:Series[];alerts?:Alerts[];services?:boolean} = $props();

</script>
<section aria-label="C-QAS monitoring evidence">
 <h2>Monitoring evidence</h2>
 <p>Provisional observations and advisory alerts. These do not establish a trend or collection-wide compliance.</p>
 {#if !series.length && !alerts.length}<p>No published series or alert snapshots available.</p>{/if}
 {#each series as document (document.definition.id)}
  <article><h3>{document.definition.id} · {document.definition.site}</h3>
   <p>{document.summary.statement}</p>
   <p>Configured minimum: {document.definition.min_scenes} distinct acquisitions per segment.</p>
   {#if !document.segments.length}<p>No valid observations available for this selection.</p>{/if}
   {#each document.segments as segment (segment.id)}
    <h4>{segment.key.check} · Processing {segment.key.processing_label}</h4>
    <p>Observation status: {segment.status.replaceAll('_', ' ')}.</p>
    <div class="scroll"><table><caption>Separate segment — {segment.id}</caption>
     <thead><tr><th>Acquired</th><th>Value ({document.definition.unit})</th><th>Outcome / uncertainty</th><th>Source result ID</th></tr></thead>
     <tbody>{#each segment.observations as point (point.result_id)}<tr>
      <td>{point.acquired}</td><td>{point.status==='gap'?'—':String(point.value)}</td>
      <td>{point.status==='gap'?'Gap: '+point.reason?.code:JSON.stringify(point.uncertainty)}</td>
      <td><code>{point.result_id}</code></td>
     </tr>{/each}</tbody>
    </table></div>
   {/each}
   <details><summary>Change markers and source evidence</summary>
    <ul>{#each document.markers as marker}<li>{marker.at}: {marker.reasons.join(', ')} · {marker.before_result} → {marker.after_result}</li>{/each}</ul>
    <pre>{JSON.stringify(document.sources,null,2)}</pre>
   </details><p>{document.scope_note}</p>
  </article>
 {/each}
 {#each alerts as document}
  <article><h3>Advisory alert snapshot</h3><p>Evaluated {document.evaluated_at}</p>
   <h4>Quality alerts</h4>
   {#each document.quality_alerts.filter(a=>services||relatedQuality(a.series_id,series,document)) as alert}
    <p>{alert.statement} {alert.series_id}: {alert.observed_change} {alert.unit}; configured band {alert.band.limit} {alert.band.unit} ({alert.band.source}).</p>
    <p>Source results: <code>{alert.result_ids.join(', ')}</code></p>
   {:else}<p>No quality alerts for this selection in this snapshot.</p>{/each}
   {#if services}<h4>Service alerts</h4><p>{document.coverage_note}</p>
    {#each document.service_alerts as alert}
     <p>{alert.reason.replaceAll('_',' ')} · {alert.subject} · observed {alert.source.observed_at}</p>
     <p>Evidence: <code>{alert.source.evidence}</code></p>
    {:else}<p>No service alerts in the supplied evidence. Coverage may be incomplete.</p>{/each}
   {/if}
  </article>
 {/each}
</section>
<style>
 section {margin-block:2rem;} article {border:1px solid #cbd5e1;border-radius:.75rem;padding:1rem;margin-block:1rem;}
 .scroll {overflow-x:auto;} table {border-collapse:collapse;width:100%;} th,td {padding:.5rem;text-align:left;border-bottom:1px solid #cbd5e1;vertical-align:top;}
 caption {text-align:left;overflow-wrap:anywhere;} pre,code {white-space:pre-wrap;overflow-wrap:anywhere;} summary {cursor:pointer;}
</style>
