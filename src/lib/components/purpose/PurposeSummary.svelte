<script lang="ts">
	import { guidanceStatus, outputLabel, purposeSentence } from '$lib/domain/purpose';
	import { app } from '$lib/state/app.svelte';

	let { compact = false }: { compact?: boolean } = $props();
	const store = app();
	const g = store.guidance;
	let context = $derived(store.purposeContext);
	// Purpose actions (apply, clear) are undoable here as well as in the criteria panel, which collapses on narrow screens.
	let purposeUndo = $derived(store.undo && store.undo.purposeBefore !== undefined ? store.undo.label : null);
</script>

{#if context?.kind === 'ok'}
	{@const answers = context.answers}
	<section class="purpose-summary" aria-labelledby="purpose-summary-heading">
		<div class="head">
			<h2 id="purpose-summary-heading" tabindex="-1">Your purpose</h2>
			<span class="badge progress">{guidanceStatus(g, answers).label}</span>
			{#if store.purposeAdjusted}<span class="badge info">Filters adjusted since setup</span>{/if}
		</div>
		<p class="sentence">{purposeSentence(answers, g, { includePrivate: context.source === 'session' })}{#if outputLabel(answers, g)}{' '}<span class="secondary">Output: {outputLabel(answers, g)}.</span>{/if}</p>
		{#if context.source === 'link'}<p class="small secondary">Purpose from a shared link. Private details such as descriptions, area and period are not shared.</p>{/if}
		{#if !compact && store.experience === 'new'}
			<p class="small secondary">New to Earth observation data? Open <strong>Details</strong> on a product to see what was reported and what is still to check; the <strong>Glossary</strong> at the top explains the terms.</p>
		{/if}
		{#if !compact}
			<p class="small secondary">{store.purposeChecks.length} purpose checks appear on each product’s details and in the comparison. Results are screened only by your filters, not by the purpose.</p>
		{/if}
		<div class="row">
			<button type="button" class="button small" onclick={() => store.openJourney()}>Edit purpose</button>
			<button type="button" class="button small plain" onclick={() => store.clearPurpose()}>Clear purpose</button>
			{#if purposeUndo}<button type="button" class="button small plain" onclick={() => store.undoLast()}>Undo: {purposeUndo}</button>{/if}
		</div>
		{#if !compact}<p class="hint">Clear criteria keeps your purpose; Clear purpose keeps your filters, shortlist and notes.</p>{/if}
	</section>
{:else if context}
	<div class="notice warn" role="status">
		<p>
			{#if context.kind === 'version-mismatch'}This link refers to purpose guidance version {context.version}, which isn’t available here (current version {g.version}).{:else}This link refers to a purpose this version of the explorer doesn’t recognise.{/if}
			Its filters and selections were kept, but purpose-specific checks are not shown so that different rules are not applied silently.
		</p>
		<div class="row">
			<button type="button" class="button small" onclick={() => store.openJourney()}>Start with your purpose</button>
			<button type="button" class="button small plain" onclick={() => store.clearPurpose()}>Remove purpose from link</button>
		</div>
	</div>
{:else if !compact}
	<section class="purpose-start panel-subtle" aria-label="Start with your purpose">
		<p><strong>Start with your purpose.</strong> Describe what you need the data for to get a suggested starting setup and checks worth making.</p>
		<div class="row">
			<button type="button" class="button small" onclick={() => store.openJourney()}>Start with your purpose</button>
			{#if purposeUndo}<button type="button" class="button small plain" onclick={() => store.undoLast()}>Undo: {purposeUndo}</button>{/if}
		</div>
	</section>
{/if}

<style>
	.purpose-summary {
		display: grid;
		gap: 8px;
		padding: var(--space-2);
		border: 1px solid var(--line);
		border-left: 4px solid var(--accent);
		border-radius: var(--radius-card);
		background: var(--panel);
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.head h2 {
		font-family: var(--font-mono);
		font-size: 12px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-right: 4px;
	}
	.head h2:focus {
		outline: none;
	}
	.purpose-summary {
		scroll-margin-top: calc(var(--nav-height) + 16px);
	}
	.head .badge {
		white-space: normal;
		max-width: 100%;
	}
	.sentence {
		font-size: 1.1rem;
		font-weight: 600;
	}
	.purpose-start {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-1);
	}
</style>
