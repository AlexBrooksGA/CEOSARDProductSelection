<script lang="ts">
	import type { CqasReport } from '$lib/domain/cqas';
	let { report }: { report: CqasReport } = $props();
	let active = $state<string | null>(null);
</script>

<div class="runcode" role="group" aria-label="Run code {report.run.code}">
	{#each report.run.segments as segment, i (segment.code)}
		{#if i}<span class="sep" aria-hidden="true">-</span>{/if}
		<button
			type="button"
			class="seg"
			class:on={active === segment.code}
			aria-label="{segment.code}: {segment.part}, {segment.meaning}"
			onmouseenter={() => (active = segment.code)}
			onmouseleave={() => (active = null)}
			onfocus={() => (active = segment.code)}
			onblur={() => (active = null)}>{segment.code}</button
		>
	{/each}
</div>
<table class="cq-table legend">
	<thead><tr><th scope="col">Code</th><th scope="col">Part</th><th scope="col">Meaning</th></tr></thead>
	<tbody>
		{#each report.run.segments as segment (segment.code)}
			<tr class:on={active === segment.code} onmouseenter={() => (active = segment.code)} onmouseleave={() => (active = null)}>
				<td class="mono"><b>{segment.code}</b></td>
				<td>{segment.part}</td>
				<td>{segment.meaning}</td>
			</tr>
		{/each}
	</tbody>
</table>

<style>
	.runcode {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px;
	}
	.seg {
		font-family: var(--font-mono);
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--text);
		background: var(--panel);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-control);
		padding: 2px 8px;
		cursor: help;
	}
	.seg.on,
	.seg:hover {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}
	.sep {
		font-family: var(--font-mono);
		font-size: 1.2rem;
		color: var(--text-muted);
		padding: 0 1px;
	}
	.legend td,
	.legend th {
		padding: 5px 8px;
	}
	.legend tr.on td {
		background: var(--accent-soft);
	}
</style>
