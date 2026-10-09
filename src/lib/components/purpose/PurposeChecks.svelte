<script lang="ts">
	import { CHECK_OUTCOME_LABELS, checkActions, outputNote, productMeasurementNote, sourcesFor, type CheckOutcome } from '$lib/domain/purpose';
	import type { Product } from '$lib/domain/types';
	import { app } from '$lib/state/app.svelte';
	import ExternalLink from '../ExternalLink.svelte';

	/** Purpose-specific checks for one product, with next actions and the user's own outcomes. */
	let { product, detailHref, compact = false }: { product: Product; detailHref: string; compact?: boolean } = $props();
	const store = app();
	const g = store.guidance;
	let answers = $derived(store.purposeAnswers);
	let checks = $derived(store.purposeChecks);
	let idBase = $derived(product.id.replace(/[^a-z0-9-]/gi, '-'));
</script>

{#if answers}
	<div class="purpose-checks stack">
		{#if !compact}
			{@const note = productMeasurementNote(g, answers, product)}
			{#if note}<p><strong>This measurement for your purpose:</strong> {note}</p>{/if}
			{#if outputNote(g, answers)}<p><strong>From product to your output:</strong> {outputNote(g, answers)}</p>{/if}
		{/if}
		<ul class="checks">
			{#each checks as check (check.id)}
				{@const outcome = store.checkOutcome(product.id, check.id)}
				{@const stale = outcome && outcome.purpose !== store.explorer.purpose}
				<li class="check">
					<div class="check-head">
						<strong>{check.label}</strong>
						<span class="badge {outcome && outcome.outcome !== 'open' ? (outcome.outcome === 'concern' ? 'progress' : 'neutral') : 'info'}">{outcome ? CHECK_OUTCOME_LABELS[outcome.outcome] : 'Manual check — open'}</span>
					</div>
					{#if !compact}<p class="small secondary">{check.why}</p>{/if}
					{#if stale}<p class="small state outside">Recorded for a different purpose — review this outcome.</p>{/if}
					<div class="row small">
						{#each checkActions(check, product, g, detailHref) as action (action.url)}
							{#if action.internal}<a href={action.url}>{action.label}</a>{:else}<ExternalLink href={action.url}>{action.label}</ExternalLink>{/if}
						{/each}
						{#if !compact}
							{#each sourcesFor(g, check.sources) as source (source.id)}<span class="muted">Source: <ExternalLink href={source.url}>{source.short} ({source.year})</ExternalLink></span>{/each}
						{/if}
					</div>
					<div class="outcome">
						<label for="outcome-{idBase}-{check.id}" class="small">Your record<span class="visually-hidden"> for {check.label}{compact ? ` — ${product.product_name}` : ''}</span></label>
						<select id="outcome-{idBase}-{check.id}" value={outcome?.outcome ?? 'open'} onchange={(e) => store.setCheckOutcome(product.id, check.id, e.currentTarget.value as CheckOutcome)}>
							{#each Object.entries(CHECK_OUTCOME_LABELS) as [value, label] (value)}<option {value}>{label}</option>{/each}
						</select>
						<label for="outcome-note-{idBase}-{check.id}" class="visually-hidden">Note for {check.label}{compact ? ` — ${product.product_name}` : ''}</label>
						<input id="outcome-note-{idBase}-{check.id}" type="text" maxlength="400" placeholder="Your note (optional)" value={outcome?.note ?? ''} onchange={(e) => store.setCheckOutcome(product.id, check.id, outcome?.outcome ?? 'open', e.currentTarget.value)} />
					</div>
				</li>
			{/each}
		</ul>
		<p class="hint">Your records are your own conclusions, kept in this browser session. They are not sourced facts and do not filter results.</p>
	</div>
{/if}

<style>
	.checks {
		display: grid;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.check {
		display: grid;
		gap: 6px;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-card);
		background: var(--panel-subtle);
	}
	.check-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
	}
	.outcome {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
	}
	.outcome select {
		width: auto;
		min-height: 36px;
		font-size: 0.85rem;
	}
	.outcome input {
		flex: 1 1 200px;
		min-height: 36px;
		font-size: 0.85rem;
	}
</style>
