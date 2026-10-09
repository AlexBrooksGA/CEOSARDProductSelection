<script lang="ts">
	import { buildComparison, OPTIONAL_GROUPS } from '$lib/domain/comparison';
	import type { Product } from '$lib/domain/types';
	import { app } from '$lib/state/app.svelte';
	import AssessmentBadge from './AssessmentBadge.svelte';
	import ExternalLink from './ExternalLink.svelte';

	let { products }: { products: Product[] } = $props();
	const store = app();
	let groups = $derived(buildComparison(products, store.criteria, store.explorer.fields, store.provenanceMap));
	$effect(() => {
		void store.ensureProvenance(products.map((product) => product.id));
	});
	function toggleGroup(id: string, checked: boolean) {
		store.patch((draft) => {
			draft.fields = checked ? [...draft.fields, id] : draft.fields.filter((field) => field !== id);
		});
	}
</script>

<div class="stack">
	<fieldset class="field-chooser">
		<legend>Choose comparison fields</legend>
		<p class="hint">Default rows always show spatial and temporal facts, your criteria, assessment, quality evidence, format and access.</p>
		<div class="row">
			{#each OPTIONAL_GROUPS as group (group.id)}
				<label class="check"><input type="checkbox" checked={store.explorer.fields.includes(group.id)} onchange={(event) => toggleGroup(group.id, event.currentTarget.checked)} />{group.title}</label>
			{/each}
		</div>
	</fieldset>

	<!-- A focusable scroll region lets keyboard users scroll a wide comparison. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div class="table-scroll" role="region" aria-labelledby="compare-caption" tabindex="0">
		<table class="compare">
			<caption id="compare-caption">Side-by-side comparison of {products.length} products. “Differs” marks a different value, not a worse one.</caption>
			<thead>
				<tr>
					<td class="corner"></td>
					{#each products as product (product.id)}
						<th scope="col">
							<a href={store.href(`/products/${encodeURIComponent(product.id)}`)}>{product.product_name}</a>
							<span class="small secondary col-provider">{product.provider ?? 'Provider not reported'}</span>
							<span class="row badges"><AssessmentBadge {product} /></span>
							<button type="button" class="button small plain" onclick={() => store.toggleCompare(product.id)}>Remove column<span class="visually-hidden"> {product.product_name} (stays on shortlist)</span></button>
						</th>
					{/each}
				</tr>
			</thead>
			{#each groups as group (group.id)}
				<tbody>
					<tr class="group-row">
						<th scope="colgroup" colspan={products.length + 1}>
							<span class="group-title">{group.title}</span>
							<span class="small secondary group-description">{group.description}</span>
						</th>
					</tr>
					{#each group.rows as row (row.id)}
						<tr class:differs={row.differs}>
							<th scope="row">
								{row.label}
								{#if row.differs}<span class="differs-label">Differs</span>{/if}
								{#if row.help}<span class="row-help small secondary">{row.help}</span>{/if}
								{#if row.incomparable}<span class="row-help small incomparable">{row.incomparable}</span>{/if}
							</th>
							{#each row.cells as cell, index (index)}
								<td>
									{#if cell.text}
										<span class={cell.state ? `state ${cell.state}` : ''}>{cell.state === 'met' ? '✓ ' : cell.state === 'outside' ? '△ ' : cell.state === 'unknown' ? '? ' : ''}{cell.text}</span>
									{:else}
										<span class="missing">{cell.missingText ?? 'Not established in this catalogue'}</span>
									{/if}
									{#if cell.detail}<span class="detail small secondary">{cell.detail}</span>{/if}
									{#if cell.link}<span class="detail"><ExternalLink href={cell.link.url} class="button small">{cell.link.label}<span class="visually-hidden"> for {products[index]?.product_name}</span></ExternalLink></span>{/if}
									{#if cell.links?.length}
										<span class="detail small">{#each cell.links as link, i (link.url)}{#if i}<span aria-hidden="true">&nbsp;·&nbsp;</span>{/if}<ExternalLink href={link.url}>{link.label}</ExternalLink>{/each}</span>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			{/each}
		</table>
	</div>
</div>

<style>
	.field-chooser legend {
		margin-bottom: 4px;
	}
	.table-scroll {
		/* Positioned so visually hidden text inside cells cannot escape the scroll region. */
		position: relative;
		overflow-x: auto;
		border: 1px solid var(--line);
		border-radius: var(--radius-card);
		background: var(--panel);
	}
	.compare {
		width: 100%;
		min-width: 640px;
		border-collapse: collapse;
		font-size: 0.92rem;
	}
	caption {
		padding: 10px 14px;
		text-align: left;
		color: var(--text-secondary);
		font-size: 0.85rem;
	}
	th,
	td {
		padding: 12px 14px;
		border-top: 1px solid var(--line);
		text-align: left;
		vertical-align: top;
	}
	thead th {
		min-width: 200px;
		font-size: 1rem;
	}
	thead th a {
		color: var(--text);
		font-weight: 600;
	}
	.col-provider,
	.badges {
		display: flex;
		margin-top: 4px;
	}
	.corner {
		border-top: 0;
	}
	tbody th[scope='row'] {
		position: sticky;
		left: 0;
		z-index: 1;
		width: 220px;
		min-width: 180px;
		background: var(--panel);
		font-weight: 600;
	}
	.group-row th {
		background: var(--raised);
		padding-block: 10px;
	}
	.group-title {
		display: block;
		font-family: var(--font-mono);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.group-description {
		display: block;
		font-weight: 400;
		margin-top: 2px;
	}
	tr.differs td {
		background: var(--diff-bg);
	}
	tr.differs th[scope='row'] {
		box-shadow: inset 3px 0 0 var(--diff-bar);
	}
	.differs-label {
		display: inline-block;
		margin-left: 6px;
		padding: 0 6px;
		border: 1px solid var(--diff-bar);
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: 700;
		vertical-align: 1px;
	}
	.row-help,
	.detail {
		display: block;
		margin-top: 4px;
		font-weight: 400;
	}
	.incomparable {
		color: var(--warn-fg);
	}
	@media (max-width: 767px) {
		tbody th[scope='row'] {
			width: 128px;
			min-width: 118px;
			font-size: 0.85rem;
		}
		thead th {
			min-width: 170px;
		}
		.row-help:not(.incomparable) {
			display: none;
		}
	}
</style>
