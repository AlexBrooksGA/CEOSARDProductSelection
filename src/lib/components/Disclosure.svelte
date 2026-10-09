<script lang="ts">
	import type { Snippet } from 'svelte';
	import { app } from '$lib/state/app.svelte';

	interface Props {
		/** Session key that remembers the open state. */
		key: string;
		label: string;
		/** Visible summary that stays readable while collapsed (e.g. evidence availability). */
		summary?: string;
		defaultOpen?: boolean;
		level?: 'h2' | 'h3' | 'h4' | null;
		children: Snippet;
	}
	let { key, label, summary, defaultOpen = false, level = null, children }: Props = $props();
	const store = app();
	let regionId = $derived(`disclosure-${key.replace(/[^a-z0-9-]/gi, '-')}`);
	let open = $derived(store.isOpen(key, defaultOpen));
</script>

<div class="disclosure">
	{#snippet toggle()}
		<button type="button" class="disclosure-toggle" aria-expanded={open} aria-controls={regionId} onclick={() => store.setOpen(key, !open)}>
			{label}
		</button>
	{/snippet}
	{#if level === 'h2'}<h2 class="disclosure-heading">{@render toggle()}</h2>
	{:else if level === 'h3'}<h3 class="disclosure-heading">{@render toggle()}</h3>
	{:else if level === 'h4'}<h4 class="disclosure-heading">{@render toggle()}</h4>
	{:else}{@render toggle()}{/if}
	{#if summary}<p class="disclosure-summary small secondary">{summary}</p>{/if}
	<div id={regionId} class="disclosure-body" hidden={!open}>
		{#if open}{@render children()}{/if}
	</div>
</div>

<style>
	.disclosure-heading {
		font-size: inherit;
		margin: 0;
	}
	.disclosure-summary {
		margin-left: 18px;
	}
	.disclosure-body {
		padding: 6px 0 4px 18px;
	}
</style>
