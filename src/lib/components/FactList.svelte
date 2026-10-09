<script lang="ts">
	import type { Fact } from '$lib/domain/facts';
	let { facts, compact = false }: { facts: Fact[]; compact?: boolean } = $props();
</script>

<dl class="facts" class:compact>
	{#each facts as fact (fact.label)}
		<div class="fact">
			<dt>{fact.label}{#if fact.displayOnly}<span class="display-only">display only</span>{/if}</dt>
			<dd>
				{#if fact.value}{fact.value}{:else}<span class="missing">{fact.missing?.text ?? 'Not established in this catalogue'}</span>{/if}
				{#if fact.basis}<span class="basis">{fact.basis}</span>{/if}
				{#if fact.note && !compact}<span class="basis">{fact.note}</span>{/if}
			</dd>
		</div>
	{/each}
</dl>

<style>
	.compact {
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
	}
</style>
