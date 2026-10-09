<script lang="ts">
	import { isMimRecord } from '$lib/domain/facts';
	import type { Product } from '$lib/domain/types';
	import { app } from '$lib/state/app.svelte';

	let { product }: { product: Product } = $props();
	const store = app();
	let agency = $derived(product.agency || product.provider);
	let mark = $derived(agency ? store.agencyMarks[agency] : undefined);
	let initials = $derived(((agency ?? 'EO').match(/[A-Za-z0-9]+/g) ?? ['EO']).slice(0, 3).map((word) => word[0]).join('').toUpperCase());
</script>

<!-- API records stay visually neutral; bundled records show a vendored identity mark (no endorsement implied). -->
{#if !isMimRecord(product)}
	{#if mark}
		<span class="agency-mark" class:mono={mark.monochrome} title="{agency} — identity mark, no endorsement implied">
			<img src={mark.url} alt="{agency} logo" loading="lazy" decoding="async" />
		</span>
	{:else}
		<span class="agency-mark fallback" title="{agency ?? 'Agency not reported'} — logo unavailable" aria-hidden="true">{initials}</span>
	{/if}
{/if}

<style>
	.agency-mark {
		display: grid;
		place-items: center;
		flex: none;
		width: 72px;
		height: 34px;
		padding: 4px 6px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: #fffdf8;
	}
	img {
		display: block;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
	.mono img {
		filter: brightness(0) saturate(100%);
	}
	.fallback {
		background: var(--panel-subtle);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 700;
	}
</style>
