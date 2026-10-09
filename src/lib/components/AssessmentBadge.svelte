<script lang="ts">
	import { assessmentLabel } from '$lib/domain/facts';
	import type { Product } from '$lib/domain/types';
	let { product }: { product: Product } = $props();
	let label = $derived(assessmentLabel(product));
	const icon = { assessed: '✓', progress: '◔', neutral: '?' } as const;
</script>

<span class="badge {label.tone}"><span aria-hidden="true">{icon[label.tone]}</span>{label.text}</span>
{#if product.pfs_version || product.ceos_ard_pfs}
	<span class="badge neutral" title="Product Family Specification">PFS {product.ceos_ard_pfs ?? product.pfs_version}</span>
{/if}
