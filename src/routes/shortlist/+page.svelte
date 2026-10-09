<script lang="ts">
	import { page } from '$app/state';
	import AssessmentBadge from '$lib/components/AssessmentBadge.svelte';
	import CompareTable from '$lib/components/CompareTable.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import { activeCriteria, describeCriterion } from '$lib/domain/criteria';
	import { accessAction } from '$lib/domain/facts';
	import { familyLabel } from '$lib/domain/guidance';
	import { SCOPE_LABELS } from '$lib/domain/profiles';
	import { COMPARE_MAX } from '$lib/domain/selection';
	import { buildSelectionSummary, noteNeedsReview } from '$lib/domain/summary';
	import { NOTE_MAX } from '$lib/state/session';
	import { SHARE_URL_SOFT_LIMIT } from '$lib/state/url';
	import { app } from '$lib/state/app.svelte';
	import type { Product } from '$lib/domain/types';

	const store = app();
	let explorer = $derived(store.explorer);
	let entries = $derived(explorer.shortlist.map((id) => ({ id, product: store.productsById[id] ?? null })));
	let compared = $derived(explorer.compare.map((id) => store.productsById[id]).filter((product): product is Product => Boolean(product)));
	let unresolvedCompared = $derived(explorer.compare.filter((id) => !store.productsById[id]));
	let criteria = $derived(activeCriteria(explorer.criteria));
	let copyStatus = $state('');
	let shareUrl = $derived(`${page.url.origin}/shortlist?${store.query}`);
	let longUrl = $derived(shareUrl.length > SHARE_URL_SOFT_LIMIT);
	let anyUnresolvedMim = $derived(explorer.shortlist.some((id) => id.startsWith('mim-product:') && !store.productsById[id]));

	$effect(() => {
		void store.ensureProvenance(explorer.shortlist);
	});

	async function copy(text: string, label: string) {
		try {
			await navigator.clipboard.writeText(text);
			copyStatus = `${label} copied to the clipboard.`;
		} catch {
			// Fallback for browsers that block the async clipboard API.
			const area = document.createElement('textarea');
			area.value = text;
			area.setAttribute('readonly', '');
			area.style.position = 'fixed';
			area.style.opacity = '0';
			document.body.append(area);
			area.select();
			const ok = document.execCommand('copy');
			area.remove();
			copyStatus = ok ? `${label} copied to the clipboard.` : `Copying was blocked by the browser. Select and copy the ${label.toLowerCase()} manually.`;
		}
		store.announce(copyStatus);
	}

	async function copySummary() {
		await store.ensureProvenance(explorer.shortlist);
		const text = buildSelectionSummary({
			snapshot: new Date(),
			shareUrl,
			state: explorer,
			products: store.productsById,
			notes: store.session.notes,
			investigationNote: store.session.investigationNote,
			currentFingerprint: store.fingerprint,
			provenance: store.provenanceMap,
			unresolvedReason: (id) => store.unresolvedReason(id)
		});
		await copy(text, 'Selection summary');
	}
</script>

<svelte:head>
	<title>Shortlist &amp; compare · CEOS-ARD Product Explorer</title>
</svelte:head>

<div class="frame page">
	<header class="page-head">
		<p class="eyebrow">Shortlist &amp; compare</p>
		<h1>Your shortlist</h1>
		<p class="lede">Keep as many candidates as you need, then choose two or three to compare side by side. Removing a comparison column keeps the product on your shortlist.</p>
	</header>

	{#if store.urlIssues.length}
		<div class="notice warn" role="status"><p><strong>Some link settings could not be used.</strong></p><ul>{#each store.urlIssues as issue (issue)}<li>{issue}</li>{/each}</ul></div>
	{/if}

	<section class="panel stack" aria-labelledby="criteria-summary-heading">
		<div class="spread">
			<h2 id="criteria-summary-heading">Current criteria</h2>
			<a class="button small" href={store.href('/')}>Edit in Discover</a>
		</div>
		<ul class="criteria-list small">
			<li>Catalogue scope: {SCOPE_LABELS[explorer.scope]}{explorer.includeMim ? ' · MIM records included' : ''}</li>
			<li>Measurement family: {familyLabel(explorer.family)}</li>
			{#if explorer.search.trim()}<li>Search: “{explorer.search.trim()}”</li>{/if}
			{#each criteria as [name, setting] (name)}<li>{describeCriterion(name, setting)}</li>{/each}
			{#if !criteria.length}<li>No screening criteria active</li>{/if}
			{#if store.activeProfile}<li>Profile: {store.activeProfile.name}{store.activeProfileModified ? ' (Modified)' : ''}</li>{/if}
		</ul>
		<div class="field">
			<label for="investigation-note">Investigation notes <span class="badge neutral">Does not filter results</span></label>
			<textarea
				id="investigation-note"
				maxlength={NOTE_MAX}
				placeholder="Your question, area or period of interest — kept for your record only."
				value={store.session.investigationNote}
				oninput={(event) => store.setInvestigationNote(event.currentTarget.value)}
			></textarea>
			<p class="hint">Typing a place or date here does not search for data. Notes stay in this browser tab's session and are not included in links.</p>
		</div>
	</section>

	<section class="stack" aria-labelledby="shortlist-heading">
		<div class="spread">
			<h2 id="shortlist-heading">Shortlisted products <span class="mono muted">({explorer.shortlist.length})</span></h2>
			<p class="small secondary">{explorer.compare.length} of {COMPARE_MAX} chosen to compare</p>
		</div>
		{#if anyUnresolvedMim && store.mimStatus.configured}
			<div class="notice">
				<p>Some shortlisted MIM records are not loaded in this session. Loading is deliberate and does not change your criteria.</p>
				<button type="button" class="button small" disabled={store.mimBusy} onclick={() => store.mimRequest('load')}>Load MIM products</button>
			</div>
		{/if}
		{#if !entries.length}
			<div class="notice">
				<p><strong>Your shortlist is empty.</strong> Use “Add to shortlist” on product cards or details pages in Discover.</p>
				<p><a href={store.href('/')}>Go to Discover</a></p>
			</div>
		{:else}
			{#if entries.length === 1}<p class="notice">Add at least one more product to compare. You can still open details and access links below.</p>{/if}
			<ol class="shortlist">
				{#each entries as entry (entry.id)}
					{@const product = entry.product}
					{@const note = store.noteFor(entry.id)}
					{@const review = noteNeedsReview(store.session.notes[entry.id], store.fingerprint)}
					{@const inCompare = explorer.compare.includes(entry.id)}
					<li class="entry panel">
						<div class="entry-head">
							<div class="stack-tight">
								{#if product}
									<h3><a href={store.href(`/products/${encodeURIComponent(product.id)}`)}>{product.product_name}</a></h3>
									<p class="small secondary">{product.provider ?? 'Provider not reported'} · {familyLabel(product.product_family)} · <span class="mono">{product.id}</span></p>
									<div class="row"><AssessmentBadge {product} /></div>
									{@const outside = store.outsideReasons(product)}
									{#if outside}
										<p class="status outside"><strong>Outside current results:</strong> {outside.map((reason) => reason.reason).join(' ')}</p>
									{:else}
										{@const presented = store.presentProduct(product)}
										<p class="status"><strong>In current results:</strong> {presented.headline}</p>
									{/if}
								{:else}
									<h3>Record not available</h3>
									<p class="small"><span class="mono">{entry.id}</span> — {store.unresolvedReason(entry.id)}</p>
								{/if}
							</div>
							<div class="entry-actions">
								<button
									type="button"
									class="button small"
									aria-pressed={inCompare}
									disabled={!product || (!inCompare && explorer.compare.length >= COMPARE_MAX)}
									onclick={() => store.toggleCompare(entry.id)}
								>
									{inCompare ? '✓ Comparing' : 'Compare'}<span class="visually-hidden"> {product?.product_name ?? entry.id}</span>
								</button>
								{#if product}
									{@const access = accessAction(product)}
									{#if access.url}<ExternalLink href={access.url} class="button small plain">{access.label}</ExternalLink>{/if}
								{/if}
								<button type="button" class="button small plain" onclick={() => store.toggleShortlist(entry.id)}>Remove<span class="visually-hidden"> {product?.product_name ?? entry.id} from shortlist</span></button>
							</div>
						</div>
						{#if !inCompare && explorer.compare.length >= COMPARE_MAX && product}<p class="hint">Comparison is full ({COMPARE_MAX}). Remove a comparison column to compare this product; nothing is replaced automatically.</p>{/if}
						<details class="notes" open={store.isOpen(`notes:${entry.id}`, Boolean(note.rationale || note.openChecks))} ontoggle={(event) => store.setOpen(`notes:${entry.id}`, event.currentTarget.open)}>
							<summary>Notes for this product{review ? ' — review needed' : ''}</summary>
							{#if review}
								<p class="notice warn small">Review rationale: criteria changed since this note was written. <button type="button" class="button small plain" onclick={() => store.confirmNote(entry.id)}>Mark as reviewed</button></p>
							{/if}
							<div class="notes-grid">
								<div class="field">
									<label for="why-{entry.id}">Why retained</label>
									<textarea id="why-{entry.id}" maxlength={NOTE_MAX} value={note.rationale} oninput={(event) => store.setNote(entry.id, { rationale: event.currentTarget.value })}></textarea>
								</div>
								<div class="field">
									<label for="checks-{entry.id}">Open checks</label>
									<textarea id="checks-{entry.id}" maxlength={NOTE_MAX} value={note.openChecks} oninput={(event) => store.setNote(entry.id, { openChecks: event.currentTarget.value })}></textarea>
								</div>
							</div>
							<p class="hint">Does not filter results. Kept in this session only.</p>
						</details>
					</li>
				{/each}
			</ol>
		{/if}
	</section>

	<section class="stack" aria-labelledby="compare-heading">
		<h2 id="compare-heading">Comparison</h2>
		{#if unresolvedCompared.length}
			<p class="notice warn">Not shown in the comparison because the record is not available: {unresolvedCompared.join(', ')}. They remain on your shortlist.</p>
		{/if}
		{#if compared.length >= 2}
			<CompareTable products={compared} />
		{:else}
			<p class="notice">Choose {compared.length === 1 ? 'one more product' : 'two or three products'} from your shortlist to compare them side by side.</p>
		{/if}
	</section>

	<section class="panel stack" aria-labelledby="handoff-heading">
		<h2 id="handoff-heading">Keep or share this selection</h2>
		<p class="small secondary">
			The summary is a provisional decision record — product IDs, criteria, rationale, open checks, evidence links, known dates and a snapshot time. It is not an approval or quality certificate.
			Links reproduce selections and criteria, not an immutable catalogue or live availability.
		</p>
		<div class="row">
			<button type="button" class="button primary" onclick={copySummary}>Copy selection summary</button>
			<button type="button" class="button" onclick={() => copy(shareUrl, 'Link')}>Copy link</button>
		</div>
		{#if longUrl}<p class="notice warn small">This link is long ({shareUrl.length} characters) and may be cut off by some email or chat tools. Copy the selection summary as well.</p>{/if}
		<p class="small" role="status">{copyStatus}</p>
	</section>
</div>

<style>
	.criteria-list {
		margin: 0;
		padding-left: 18px;
		display: grid;
		gap: 2px;
	}
	.shortlist {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.entry {
		display: grid;
		gap: 10px;
		padding: var(--space-2);
	}
	.entry-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--space-1);
	}
	.entry-head > div:first-child {
		flex: 1 1 360px;
	}
	.entry-head h3 a {
		color: var(--text);
	}
	.entry-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 6px;
	}
	.status {
		font-size: 0.9rem;
		color: var(--text-secondary);
	}
	.status.outside strong {
		color: var(--warn-fg);
	}
	.notes summary {
		cursor: pointer;
		font-weight: 600;
		color: var(--accent-text);
		min-height: 32px;
	}
	.notes-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
		gap: var(--space-1);
		margin-top: 8px;
	}
	ul {
		margin: 0;
		padding-left: 18px;
	}
</style>
