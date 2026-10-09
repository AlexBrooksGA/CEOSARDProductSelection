<script lang="ts">
	import { describeCriterion, isActiveMode } from '$lib/domain/criteria';
	import { MIM_SOURCE_TYPE } from '$lib/domain/facts';
	import { ALL_FAMILIES } from '$lib/domain/filters';
	import { familyLabel } from '$lib/domain/guidance';
	import type { PresentedResult, ResultSection } from '$lib/domain/presentation';
	import { SCOPE_LABELS } from '$lib/domain/profiles';
	import type { CriterionName } from '$lib/domain/types';
	import { app } from '$lib/state/app.svelte';
	import ProductCard from './ProductCard.svelte';

	const store = app();
	let explorer = $derived(store.explorer);
	let presented = $derived(store.presented);
	const MIM_PAGE = 24;
	let mimLimit = $state(MIM_PAGE);

	interface Chip {
		label: string;
		remove: () => void;
	}
	let chips = $derived.by(() => {
		const list: Chip[] = [];
		if (explorer.search.trim()) list.push({ label: `Search “${explorer.search.trim()}”`, remove: () => store.patch((d) => void (d.search = '')) });
		if (explorer.family !== ALL_FAMILIES) list.push({ label: `Family: ${familyLabel(explorer.family)}`, remove: () => store.patch((d) => void (d.family = ALL_FAMILIES)) });
		for (const [name, setting] of Object.entries(explorer.criteria)) {
			if (!setting || !isActiveMode(setting.mode)) continue;
			list.push({ label: describeCriterion(name as CriterionName, setting), remove: () => store.patch((d) => void delete d.criteria[name as CriterionName]) });
		}
		for (const provider of explorer.providers) list.push({ label: `Provider: ${provider}`, remove: () => store.patch((d) => void (d.providers = d.providers.filter((p) => p !== provider))) });
		if (explorer.sensor.trim()) list.push({ label: `Sensor contains “${explorer.sensor.trim()}”`, remove: () => store.patch((d) => void (d.sensor = '')) });
		for (const status of explorer.operational) list.push({ label: `Status: ${status}`, remove: () => store.patch((d) => void (d.operational = d.operational.filter((s) => s !== status))) });
		for (const source of explorer.sources) list.push({ label: `Source: ${source === 'curated_ceos_ard' ? 'Curated' : source}`, remove: () => store.patch((d) => void (d.sources = d.sources.filter((s) => s !== source))) });
		if (explorer.hideUnknown) list.push({ label: 'Hiding unreported values', remove: () => store.patch((d) => void (d.hideUnknown = false)) });
		return list;
	});

	/** Port of `limit_mim_results`: limit rendered MIM cards only; matching and counts are unchanged. */
	let visibleSections = $derived.by(() => {
		let remaining = mimLimit;
		return presented.sections.map((section) => ({
			...section,
			items: section.items.filter((item) => {
				if (item.result.product.source_type !== MIM_SOURCE_TYPE) return true;
				if (remaining > 0) {
					remaining -= 1;
					return true;
				}
				return false;
			})
		}));
	});
	let mimTotal = $derived(presented.sections.reduce((sum, section) => sum + section.items.filter((item: PresentedResult) => item.result.product.source_type === MIM_SOURCE_TYPE).length, 0));
	let empty = $derived(presented.counts.total === 0);
	let noneMeeting = $derived(presented.mode === 'requirements' && presented.counts.meetRequired === 0 && presented.counts.total > 0);

	function sectionCount(section: ResultSection): number {
		return presented.sections.find((s) => s.key === section.key)?.items.length ?? 0;
	}
</script>

<div class="results stack">
	<div class="summary-strip">
		<div class="spread">
			<h2 id="results-heading">
				{presented.mode === 'browse' ? 'Browse products' : 'Results'}
				<span class="count mono">{presented.counts.total} {presented.counts.total === 1 ? 'product' : 'products'}</span>
			</h2>
			<span class="badge neutral">{SCOPE_LABELS[explorer.scope]}{explorer.includeMim ? ' · MIM included' : ''}</span>
		</div>
		{#if presented.mode === 'requirements'}
			<p class="counts" aria-live="polite">
				<span><strong>{presented.counts.meetRequired}</strong> meet required criteria</span>
				<span><strong>{presented.counts.outsideRequired}</strong> reported outside a requirement</span>
				<span><strong>{presented.counts.needsEvidence}</strong> need evidence</span>
			</p>
		{:else}
			<p class="counts" aria-live="polite"><span>{presented.mode === 'browse' ? 'No screening criteria are active.' : 'Only preferences are active; no product is excluded.'}</span></p>
		{/if}
		{#if chips.length}
			<ul class="chips" aria-label="Active restrictions">
				{#each chips as chip (chip.label)}
					<li class="chip">{chip.label}<button type="button" aria-label="Remove {chip.label}" onclick={chip.remove}>×</button></li>
				{/each}
			</ul>
		{/if}
		{#if explorer.scope !== 'All statuses'}
			<p class="small secondary">Scope: {SCOPE_LABELS[explorer.scope]}. <button type="button" class="button plain small" onclick={() => store.patch((d) => void (d.scope = 'All statuses'), 'push')}>Broaden to all available statuses</button></p>
		{/if}
		{#if presented.orderingNote}<p class="hint">{presented.orderingNote}</p>{/if}
	</div>

	{#if empty}
		<div class="notice warn" role="status">
			<p><strong>No products match the current settings.</strong> Your criteria are kept so you can adjust them.</p>
			<div class="row">
				{#if explorer.search.trim()}<button type="button" class="button small" onclick={() => store.patch((d) => void (d.search = ''))}>Remove search “{explorer.search.trim()}”</button>{/if}
				{#if explorer.family !== ALL_FAMILIES}<button type="button" class="button small" onclick={() => store.patch((d) => void (d.family = ALL_FAMILIES))}>Show all families</button>{/if}
				{#if explorer.scope !== 'All statuses'}<button type="button" class="button small" onclick={() => store.patch((d) => void (d.scope = 'All statuses'), 'push')}>Broaden scope</button>{/if}
				{#if explorer.hideUnknown}<button type="button" class="button small" onclick={() => store.patch((d) => void (d.hideUnknown = false))}>Show records with unreported values</button>{/if}
				<button type="button" class="button small" onclick={() => store.clearCriteria()}>Clear criteria</button>
			</div>
		</div>
	{/if}

	{#each visibleSections as section (section.key)}
		{#if section.collapsible}
			{@const open = store.isOpen(`section:${section.key}`, false)}
			<section class="result-section manual" aria-labelledby="h-{section.key}">
				<div class="spread section-head">
					<h3 id="h-{section.key}">{section.title} <span class="count mono">{sectionCount(section)}</span></h3>
					{#if sectionCount(section)}
						<button type="button" class="button small" aria-expanded={open} aria-controls="list-{section.key}" onclick={() => store.setOpen(`section:${section.key}`, !open)}>{open ? 'Hide' : 'Show'} {sectionCount(section)}</button>
					{/if}
				</div>
				<p class="hint">{section.description}</p>
				<div id="list-{section.key}" class="grid" hidden={!open}>
					{#if open}{#each section.items as item (item.result.product.id)}<ProductCard {item} showReasons />{/each}{/if}
				</div>
			</section>
		{:else}
			<section class="result-section" aria-labelledby={presented.mode === 'requirements' ? `h-${section.key}` : 'results-heading'}>
				{#if presented.mode === 'requirements'}
					<h3 id="h-{section.key}">{section.title} <span class="count mono">{sectionCount(section)}</span></h3>
					<p class="hint">{section.description}</p>
				{/if}
				{#if noneMeeting && section.key === 'meet-required'}
					<p class="notice">No product meets every Required criterion with reported values. Candidates outside a requirement or needing evidence are counted below — open them to review, or change a Required criterion to Preferred.</p>
				{/if}
				<div class="grid">
					{#each section.items as item (item.result.product.id)}<ProductCard {item} showReasons={presented.mode !== 'browse'} />{/each}
				</div>
			</section>
		{/if}
	{/each}

	{#if mimTotal > mimLimit}
		<div class="notice">
			<p>Showing {mimLimit} of {mimTotal} matching MIM records to keep the page responsive. Counts and ordering include all of them.</p>
			<div class="row">
				<button type="button" class="button small" onclick={() => (mimLimit += MIM_PAGE)}>Show {Math.min(MIM_PAGE, mimTotal - mimLimit)} more</button>
				<button type="button" class="button small plain" onclick={() => (mimLimit = mimTotal)}>Show all</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.summary-strip {
		display: grid;
		gap: 8px;
		padding: var(--space-1) var(--space-2);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
	}
	.count {
		font-size: 0.85rem;
		font-weight: 400;
		color: var(--text-muted);
		margin-left: 6px;
	}
	.counts {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 18px;
		font-size: 0.92rem;
		color: var(--text-secondary);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.result-section {
		display: grid;
		gap: 10px;
	}
	.result-section.manual {
		padding: var(--space-1) var(--space-2);
		border: 1px dashed var(--line-strong);
		border-radius: var(--radius-card);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 290px), 1fr));
		gap: var(--space-2);
	}
</style>
