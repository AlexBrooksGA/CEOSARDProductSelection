<script lang="ts">
	import { GLOSSARY } from '$lib/domain/guidance';
	import ExternalLink from './ExternalLink.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();
	let dialog: HTMLDialogElement | undefined = $state();
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});
</script>

<dialog bind:this={dialog} class="glossary" aria-labelledby="glossary-title" onclose={() => (open = false)}>
	<div class="spread">
		<h2 id="glossary-title">Glossary</h2>
		<button type="button" class="button small" onclick={() => (open = false)}>Close</button>
	</div>
	<dl>
		{#each GLOSSARY as entry (entry.id)}
			<div class="entry">
				<dt>{entry.term}</dt>
				<dd>
					{entry.definition}
					{#if entry.source}<ExternalLink href={entry.source.url}>{entry.source.label}</ExternalLink>{/if}
				</dd>
			</div>
		{/each}
	</dl>
</dialog>

<style>
	.glossary {
		width: min(100% - 24px, 680px);
		max-height: min(100% - 24px, 860px);
		padding: var(--space-3);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-panel);
		background: var(--panel);
		color: var(--text);
	}
	.glossary::backdrop {
		background: rgb(8 13 24 / 0.55);
	}
	dl {
		display: grid;
		gap: var(--space-1);
		margin: var(--space-2) 0 0;
	}
	dt {
		font-weight: 600;
	}
	dd {
		margin: 2px 0 0;
		color: var(--text-secondary);
	}
</style>
