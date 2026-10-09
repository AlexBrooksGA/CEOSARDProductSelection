<script lang="ts">
	import type { Snippet } from 'svelte';
	import { safeUrl } from '$lib/domain/facts';

	interface Props {
		href: string | null | undefined;
		class?: string;
		children: Snippet;
	}
	let { href, class: className = '', children }: Props = $props();
	let url = $derived(safeUrl(href));
</script>

{#if url}
	<a href={url} class="{className} external" target="_blank" rel="noopener noreferrer external">{@render children()}<span class="visually-hidden"> (external site, opens in a new tab)</span></a>
{/if}
