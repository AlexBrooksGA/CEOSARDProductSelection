<script lang="ts">
 import type { ReportV3 } from '$lib/domain/cqas-v3';
 let { reports }: {reports: ReportV3[]} = $props();
</script>
<section id="cqas" tabindex="-1" aria-label="C-QAS pipeline evidence">
 <h2>C-QAS pipeline evidence</h2>
 <p><a href="/monitoring">View monitoring evidence and service alerts</a></p>
 <p>Provisional pipeline output · proposed report format</p>
 {#each reports as report (report.record.product_version)}
  <article>
   <h3>{report.product.name} — {report.record.registration.product_version.provider_id}</h3>
   <p>{report.simple.statement}</p>
   <p>Acquired {report.record.registration.scene.acquired} · Processing {report.record.registration.product_version.processing.label} · State {report.record.product_state}</p>
   <p>{report.record.status_note}</p>
   <details><summary>Check results and source measurements</summary>
    {#each report.record.results as result (result.result_id)}
     <h4>{result.check} · {result.method.maturity} · {result.outcome}</h4>
     <p>Result ID: <code>{result.result_id}</code></p>
     {#if result.reason}<pre>{JSON.stringify(result.reason, null, 2)}</pre>{/if}
     <ul>{#each result.measurements as measurement}
      <li>{measurement.name} {JSON.stringify(measurement.per)}: {String(measurement.value)} {measurement.unit}
       <br />Uncertainty: {JSON.stringify(measurement.uncertainty)}</li>
     {/each}</ul>
    {/each}
   </details>
   <details><summary>Requirement findings</summary>
    <ul>{#each report.record.findings as finding (finding.finding_id)}
     <li>{finding.title} ({finding.requirement}, {finding.level}): {finding.outcome}
      <p>Sources: {finding.derived_from.join(', ') || 'No result evidence'}</p>
      {#if finding.reason}<pre>{JSON.stringify(finding.reason, null, 2)}</pre>{/if}
     </li>
    {/each}</ul>
   </details>
   <p>{report.record.scope_note}</p>
  </article>
 {/each}
</section>
<style>
 section { margin-block: 2rem; padding: 1.5rem; border: 1px solid var(--border, #cbd5e1); border-radius: .75rem; }
 article + article { border-top: 1px solid #cbd5e1; margin-top: 1.5rem; padding-top: 1rem; }
 pre, code { overflow-wrap: anywhere; white-space: pre-wrap; }
 details { margin-block: 1rem; } summary { cursor: pointer; font-weight: 600; }
</style>
