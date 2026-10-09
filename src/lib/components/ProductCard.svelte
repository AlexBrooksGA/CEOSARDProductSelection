<script lang="ts">
	import { accessAction, isMimRecord, revisitFact, spatialFact, updateFrequencyFact } from '$lib/domain/facts';
	import type { PresentedResult } from '$lib/domain/presentation';
	import { app } from '$lib/state/app.svelte';
	import AgencyMark from './AgencyMark.svelte';
	import AssessmentBadge from './AssessmentBadge.svelte';
	import ExternalLink from './ExternalLink.svelte';
	import FactList from './FactList.svelte';
	import FamilyMark from './FamilyMark.svelte';

	let { item, showReasons }: { item: PresentedResult; showReasons: boolean } = $props();
	const store = app();
	let product = $derived(item.result.product);
	let shortlisted = $derived(store.explorer.shortlist.includes(product.id));
	let access = $derived(accessAction(product));
	let prov = $derived(store.provenanceFor(product.id));
	let update = $derived(updateFrequencyFact(product, prov));
	let facts = $derived([spatialFact(product, prov), revisitFact(product, prov)]);
	let titleId = $derived(`card-${product.id.replace(/[^a-z0-9-]/gi, '-')}`);
</script>

<article class="card" class:selected={shortlisted} aria-labelledby={titleId}>
	<div class="card-top">
		<FamilyMark family={product.product_family} />
		<AgencyMark {product} />
	</div>
	<h3 id={titleId} class="card-title"><a href={store.href(`/products/${encodeURIComponent(product.id)}`)}>{product.product_name}</a></h3>
	<p class="small secondary">
		{product.provider ?? 'Provider not reported'}{#if isMimRecord(product)} · <span class="badge info">MIM record</span>{/if}
	</p>
	<div class="row badges"><AssessmentBadge {product} /></div>
	<FactList {facts} compact />
	{#if update.value}<p class="small secondary"><span class="label">Product update</span> {update.value}</p>{/if}
	{#if showReasons}
		<div class="reasons">
			<p class="small"><strong>Why shown:</strong> {item.headline}</p>
			{#if item.reasons.length}
				<ul class="reason-list small">
					{#each item.reasons as reason (reason.name)}
						<li><span class="state {reason.state}">{reason.state === 'met' ? '✓' : reason.state === 'outside' ? '△' : '?'}</span> {reason.text}</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
	<div class="card-actions">
		<a class="button small" href={store.href(`/products/${encodeURIComponent(product.id)}`)}>Details<span class="visually-hidden"> for {product.product_name}</span></a>
		<button type="button" class="button small" aria-pressed={shortlisted} onclick={() => store.toggleShortlist(product.id)}>
			{shortlisted ? '✓ On shortlist' : 'Add to shortlist'}<span class="visually-hidden"> {product.product_name}</span>
		</button>
		{#if access.url}
			<ExternalLink href={access.url} class="button small plain">{access.label}<span class="visually-hidden"> for {product.product_name}</span></ExternalLink>
		{:else}
			<span class="small muted">No access link recorded</span>
		{/if}
	</div>
	{#if access.fallback && access.url}<p class="hint">{access.explanation}</p>{/if}
</article>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
		padding: 16px 18px;
		background: var(--panel);
		border: 1px solid var(--line);
		border-top: 3px solid var(--line-strong);
		border-radius: var(--radius-card);
		transition: box-shadow 0.15s ease, border-color 0.15s ease;
	}
	.card:hover {
		box-shadow: var(--shadow-hover);
		border-color: var(--line-strong);
	}
	.card.selected {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}
	.card-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}
	.card-title {
		font-size: 1.05rem;
		line-height: 1.3;
	}
	.card-title a {
		color: var(--text);
		text-decoration: none;
	}
	.card-title a:hover {
		text-decoration: underline;
	}
	.badges {
		gap: 6px;
	}
	.reasons {
		padding: 8px 10px;
		border-left: 3px solid var(--line-strong);
		background: var(--panel-subtle);
		border-radius: 0 var(--radius-control) var(--radius-control) 0;
	}
	.reason-list {
		margin: 4px 0 0;
		padding-left: 0;
		list-style: none;
		display: grid;
		gap: 2px;
		color: var(--text-secondary);
	}
	.card-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: auto;
		padding-top: 10px;
		border-top: 1px solid var(--line);
	}
</style>
