<script lang="ts">
	import { app } from '$lib/state/app.svelte';

	const store = app();
	let explorer = $derived(store.explorer);
	let status = $derived(store.mimStatus);
	let tone = $derived(status.state === 'error' ? 'error' : status.state === 'stale' || status.state === 'not_configured' ? 'warn' : status.state === 'ready' ? 'ok' : '');
	let fetched = $derived(status.fetchedAt ? new Date(status.fetchedAt).toLocaleString() : null);
</script>

<section class="mim panel-subtle stack-tight" aria-labelledby="mim-heading">
	<h2 id="mim-heading" class="label">Additional source</h2>
	<label class="check">
		<input type="checkbox" checked={explorer.includeMim} onchange={(event) => store.patch((draft) => void (draft.includeMim = event.currentTarget.checked))} />
		<span>Include product records from the CEOS Missions, Instruments and Measurements (MIM) database</span>
	</label>
	{#if explorer.includeMim}
		<div class="notice {tone}" role="status" aria-live="polite">
			<p>{status.message}</p>
			{#if fetched && status.state !== 'not_configured'}<p class="small">Last loaded {fetched}. Kept for up to {status.ttlHours} hours on this server.</p>{/if}
		</div>
		{#if status.edition}
			<p class="small mim-edition">
				Source: {status.edition.attribution}{#if status.edition.edition}, edition <span class="mono">{status.edition.edition}</span>{/if}{#if status.edition.asOf}, data as of {status.edition.asOf}{/if}.
				{#if status.edition.licence}Licence: {#if status.edition.licence.url}<a href={status.edition.licence.url} target="_blank" rel="noopener noreferrer">{status.edition.licence.name}</a>{:else}{status.edition.licence.name}{/if}.{/if}
			</p>
		{:else if status.configured && status.host}
			<p class="hint">Source: CEOS MIM database via {status.host}.{#if status.publicAccess} No sign-in is needed.{/if}</p>
		{/if}
		{#if status.configured}
			<div class="row">
				{#if !store.mimLoaded}
					<button type="button" class="button primary" disabled={store.mimBusy} onclick={() => store.mimRequest('load')}>{store.mimBusy ? 'Loading MIM products…' : 'Load MIM products'}</button>
				{:else}
					<button type="button" class="button" disabled={store.mimBusy} onclick={() => store.mimRequest('refresh')}>{store.mimBusy ? 'Refreshing…' : 'Refresh MIM data'}</button>
				{/if}
			</div>
			<p class="hint">Loading is deliberate and never changes your filters, scope or selections. Refresh affects the MIM data only.</p>
		{:else}
			<p class="hint">{status.disabledReason === 'off' ? 'MIM is turned off for this deployment by its owner.' : 'MIM settings for this deployment are incomplete or invalid; the deployment owner can fix them on the server.'} The curated catalogue works without it.</p>
		{/if}
		{#if store.mimLoaded && store.mimHiddenByFilters > 0}
			<div class="notice warn">
				<p>{store.mimHiddenByFilters} of {store.mimProducts.length} loaded MIM records are hidden by the current scope or filters (most MIM records are not marked CEOS-ARD assessed).</p>
				{#if explorer.scope === 'CEOS-ARD assessed only'}
					<button type="button" class="button small" onclick={() => store.patch((draft) => void (draft.scope = 'All statuses'), 'push')}>Show all available statuses</button>
				{/if}
			</div>
		{/if}
		<p class="hint">MIM product resolution is used only when the record reports it; instrument resolution is shown as a labelled display fallback and never used for matching.</p>
	{/if}
</section>
