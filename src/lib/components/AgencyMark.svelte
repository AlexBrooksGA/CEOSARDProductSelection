<script lang="ts">
	import { isMimRecord } from '$lib/domain/facts';
	import { ICON_CREDIT } from '$lib/domain/mim';
	import type { Product } from '$lib/domain/types';
	import { app } from '$lib/state/app.svelte';

	let { product }: { product: Product } = $props();
	const store = app();
	let agency = $derived(product.agency || product.provider);
	let mark = $derived(agency ? store.agencyMarks[agency] : undefined);
	let initials = $derived(((agency ?? 'EO').match(/[A-Za-z0-9]+/g) ?? ['EO']).slice(0, 3).map((word) => word[0]).join('').toUpperCase());
	// The newest mission with spacecraft-specific artwork in the CEOS MIM database; generic illustrations never flip.
	let visual = $derived(store.productVisuals[product.id] ?? null);
	let missionText = $derived(visual ? `${visual.acronym ?? 'Satellite'}${visual.mission_count > 1 ? `, one of ${visual.mission_count} missions` : ''}` : '');
	let pressed = $state(false);
</script>

<!-- API records stay visually neutral; bundled records show a vendored identity mark (no endorsement implied). -->
{#snippet logo()}
	{#if mark}
		<span class="face front" class:mono={mark.monochrome}><img src={mark.url} alt={visual ? '' : `${agency} logo`} loading="lazy" decoding="async" /></span>
	{:else}
		<span class="face front fallback" aria-hidden="true">{initials}</span>
	{/if}
{/snippet}

{#if !isMimRecord(product)}
	{#if visual}
		<button
			type="button"
			class="agency-mark flip"
			aria-pressed={pressed}
			title="{agency ?? 'Agency not reported'} — identity mark, no endorsement implied. Satellite: {missionText} (CEOS MIM database; {ICON_CREDIT})"
			onclick={() => (pressed = !pressed)}
		>
			<span class="visually-hidden">{agency ?? 'Agency'} logo. Show the satellite: {missionText}, from the CEOS MIM database</span>
			<span class="inner">
				{@render logo()}
				<span class="face back"><img src={visual.icon} alt="" loading="lazy" decoding="async" /><span class="mim-corner" aria-hidden="true">*</span></span>
			</span>
		</button>
	{:else if mark}
		<span class="agency-mark" class:mono={mark.monochrome} title="{agency} — identity mark, no endorsement implied">
			<img src={mark.url} alt="{agency} logo" loading="lazy" decoding="async" />
		</span>
	{:else}
		<span class="agency-mark fallback" title="{agency ?? 'Agency not reported'} — logo unavailable" aria-hidden="true">{initials}</span>
	{/if}
{/if}

<style>
	.agency-mark {
		display: grid;
		place-items: center;
		flex: none;
		width: 72px;
		height: 34px;
		padding: 4px 6px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: #fffdf8;
	}
	img {
		display: block;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
	.mono img {
		filter: brightness(0) saturate(100%);
	}
	.fallback {
		background: var(--panel-subtle);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 700;
	}

	/* Flip: hover, keyboard focus and tap (aria-pressed) all show the satellite. */
	.flip {
		position: relative;
		padding: 0;
		cursor: pointer;
		perspective: 400px;
		font: inherit;
	}
	.flip:focus-visible {
		outline: var(--focus-width) solid var(--accent);
		outline-offset: var(--focus-offset);
	}
	.inner {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		transition: transform 0.45s ease;
		transform-style: preserve-3d;
	}
	.face {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 4px 6px;
		border-radius: inherit;
		backface-visibility: hidden;
	}
	.face.back {
		transform: rotateY(180deg);
		background: #fffdf8;
	}
	.flip:hover .inner,
	.flip:focus-visible .inner,
	.flip[aria-pressed='true'] .inner {
		transform: rotateY(180deg);
	}
	.mim-corner {
		position: absolute;
		top: 0;
		right: 3px;
		color: #7c3aed;
		font-weight: 700;
		line-height: 1;
	}
	@media (prefers-reduced-motion: reduce) {
		/* A plain swap instead of the rotation. */
		.inner {
			transition: none;
			transform: none !important;
		}
		.face {
			backface-visibility: visible;
		}
		.face.back {
			transform: none;
			visibility: hidden;
		}
		.flip:hover .face.back,
		.flip:focus-visible .face.back,
		.flip[aria-pressed='true'] .face.back {
			visibility: visible;
		}
		.flip:hover .face.front,
		.flip:focus-visible .face.front,
		.flip[aria-pressed='true'] .face.front {
			visibility: hidden;
		}
	}
</style>
