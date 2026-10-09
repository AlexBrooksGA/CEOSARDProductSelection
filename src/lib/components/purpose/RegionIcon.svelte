<script lang="ts">
	import type { RegionIcon } from '$lib/domain/purpose';

	/** A small world map with the chosen region highlighted (decorative; the label carries meaning). */
	let { icon }: { icon: RegionIcon } = $props();
</script>

<svg class="region-icon" viewBox="0 0 120 47" aria-hidden="true" focusable="false">
	{#if icon === 'PIN'}
		<use href="#pj-world" class="land" />
		<g class="pin" transform="translate(60 6)">
			<path d="M0 34c-7-9-11-15-11-21a11 11 0 0 1 22 0c0 6-4 12-11 21z" />
			<circle cy="13" r="4" class="pin-dot" />
		</g>
	{:else if icon === 'AN'}
		<use href="#pj-polar" class="land" />
		<use href="#pj-region-AN" class="highlight" />
	{:else if icon === 'GL'}
		<use href="#pj-world" class="highlight" />
	{:else}
		<use href="#pj-world" class="land" />
		<use href="#pj-region-{icon}" class="highlight" />
	{/if}
</svg>

<style>
	.region-icon {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.land {
		fill: rgb(148 175 200 / 0.32);
		color: rgb(148 175 200 / 0.4);
	}
	.highlight {
		fill: var(--pj-accent, #5eead4);
	}
	.pin path {
		fill: var(--pj-accent, #5eead4);
	}
	.pin-dot {
		fill: #0b1424;
	}
</style>
