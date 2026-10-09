<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { VisualDetail, VisualFamily } from '$lib/domain/purpose';

	/**
	 * Decorative, illustrative background. It reflects the chosen measurement and detail as a
	 * qualitative cue only; it never feeds filtering and is hidden from assistive technology.
	 */
	let { family, detail }: { family: VisualFamily; detail: VisualDetail } = $props();
	let reduceMotion = $state(false);
	let failed = $state<Record<string, boolean>>({});
	let showInfo = $state(false);

	onMount(() => {
		const query = matchMedia('(prefers-reduced-motion: reduce)');
		reduceMotion = query.matches;
		const update = () => (reduceMotion = query.matches);
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	});

	// "Neutral" (no single measurement chosen) uses a navy/teal duotone of the optical panel —
	// a stylised treatment, not another measurement depiction.
	let key = $derived(family === 'neutral' ? 'neutral' : `${family}-${detail}`);
	let src = $derived(family === 'neutral' ? '/images/purpose-journey/optical-fine.webp' : `/images/purpose-journey/${family}-${detail}.webp`);
	let duration = $derived(reduceMotion ? 0 : 320);
</script>

<div class="backdrop" aria-hidden="true">
	<div class="gradient"></div>
	<div class="frame-box">
	{#key key}
		{#if !failed[key]}
			<img
				class="scene"
				class:neutral={family === 'neutral'}
				{src}
				alt=""
				width="600"
				height="330"
				decoding="async"
				fetchpriority="high"
				in:fade={{ duration }}
				out:fade={{ duration }}
				onerror={() => (failed = { ...failed, [key]: true })}
			/>
		{/if}
	{/key}
	</div>
	<div class="scrim"></div>
</div>
<div class="imagery-label">
	<button type="button" class="imagery-button" aria-expanded={showInfo} aria-controls="imagery-info" onclick={() => (showInfo = !showInfo)}>
		Illustrative imagery <span aria-hidden="true">ⓘ</span>
	</button>
	<p id="imagery-info" class="imagery-info" hidden={!showInfo}>
		AI-generated picture of a fictional landscape. It is not satellite data, not a calibrated resolution and not evidence about any product. It changes with the measurement and detail you choose only as a visual cue, and it does not show your area or dates.
	</p>
</div>

<style>
	.backdrop {
		position: absolute;
		inset: 0;
		overflow: hidden;
		z-index: 0;
		background: #060b16;
	}
	.gradient {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(120% 90% at 85% 30%, rgb(18 64 80 / 0.55), transparent 60%),
			linear-gradient(160deg, #0a1426 0%, #060b16 70%);
	}
	/* A fixed-aspect band at the top right: identical framing in every state, at most ~1.6×
	   the 600 × 330 source, never stretched to the page height. */
	.frame-box {
		position: absolute;
		top: 0;
		right: 0;
		width: min(66%, 960px);
		aspect-ratio: 600 / 330;
		-webkit-mask-image: linear-gradient(180deg, #000 55%, transparent 100%);
		mask-image: linear-gradient(180deg, #000 55%, transparent 100%);
	}
	.scene {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		filter: saturate(0.92) contrast(1.02);
	}
	.scene.neutral {
		filter: grayscale(1) sepia(0.35) hue-rotate(150deg) saturate(1.6) brightness(0.62) contrast(1.05);
	}
	/* Stable navy scrim protecting text and controls in every image state and theme. */
	.scrim {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(90deg, #060b16 0%, rgb(6 11 22 / 0.94) 34%, rgb(6 11 22 / 0.62) 62%, rgb(6 11 22 / 0.42) 100%),
			linear-gradient(0deg, rgb(6 11 22 / 0.85) 0%, transparent 38%);
	}
	.imagery-label {
		position: absolute;
		right: var(--space-2);
		bottom: var(--space-2);
		z-index: 2;
		display: grid;
		justify-items: end;
		gap: 6px;
		max-width: min(360px, calc(100% - 32px));
	}
	.imagery-button {
		min-height: 32px;
		padding: 4px 10px;
		border: 1px solid rgb(148 222 214 / 0.35);
		border-radius: var(--radius-pill);
		background: rgb(6 11 22 / 0.72);
		color: #d6e6ee;
		font-family: var(--font-mono);
		font-size: 11.5px;
		letter-spacing: 0.04em;
		cursor: pointer;
	}
	.imagery-button:focus-visible {
		outline: 2px solid #5eead4;
		outline-offset: 2px;
	}
	.imagery-info {
		margin: 0;
		padding: 10px 12px;
		border: 1px solid rgb(148 222 214 / 0.3);
		border-radius: var(--radius-card);
		background: rgb(6 11 22 / 0.92);
		color: #d6e6ee;
		font-size: 0.85rem;
	}
	@media (max-width: 767px) {
		.frame-box {
			width: 100%;
			opacity: 0.6;
		}
	}
</style>
