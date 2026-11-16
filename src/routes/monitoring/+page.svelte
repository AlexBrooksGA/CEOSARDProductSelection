<script lang="ts">
 import CqasMonitoring from '$lib/components/cqas/CqasMonitoring.svelte';
 let { data } = $props();
</script>
<svelte:head><title>C-QAS monitoring evidence</title></svelte:head>
<h1>C-QAS monitoring</h1>
<p>Quality observations and service availability are separate evidence streams.</p>
{#if data.warnings.length}<p>Some evidence could not be loaded. Available evidence may be incomplete.</p>{/if}
<CqasMonitoring series={data.series} alerts={data.alerts} services={true} />
