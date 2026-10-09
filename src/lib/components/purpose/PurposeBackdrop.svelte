<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { VisualDetail, VisualFamily } from '$lib/domain/purpose';

	/**
	 * Decorative, illustrative background. It reflects the chosen measurement and detail as a
	 * qualitative cue only; it never feeds filtering and is hidden from assistive technology.
	 * The stage is sticky, so the scene stays in view while the entry scrolls, and it drifts
	 * gently with the pointer (fine pointers only; off with reduced motion).
	 */
	let { family, detail }: { family: VisualFamily; detail: VisualDetail } = $props();
	let reduceMotion = $state(false);
	let failed = $state<Record<string, boolean>>({});
	let layer: HTMLDivElement | undefined = $state();
	let glow: HTMLDivElement | undefined = $state();

	onMount(() => {
		const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
		const pointerQuery = matchMedia('(hover: hover) and (pointer: fine)');
		reduceMotion = motionQuery.matches;
		const target = { x: 0, y: 0, s: 0 };
		const current = { x: 0, y: 0, s: 0 };
		let frame = 0;

		const render = () => {
			frame = 0;
			const ease = 0.075;
			current.x += (target.x - current.x) * ease;
			current.y += (target.y - current.y) * ease;
			current.s += (target.s - current.s) * 0.12;
			if (layer) layer.style.transform = `translate3d(${(-current.x * 16).toFixed(2)}px, ${(-current.y * 11 - current.s * 36).toFixed(2)}px, 0) scale(1.06)`;
			if (glow) glow.style.transform = `translate3d(${(current.x * 34).toFixed(2)}px, ${(current.y * 22).toFixed(2)}px, 0)`;
			const moving = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) + Math.abs(target.s - current.s) > 0.001;
			if (moving) frame = requestAnimationFrame(render);
		};
		const kick = () => {
			if (!frame && !reduceMotion) frame = requestAnimationFrame(render);
		};
		const onPointer = (event: PointerEvent) => {
			if (!pointerQuery.matches) return;
			target.x = (event.clientX / window.innerWidth - 0.5) * 2;
			target.y = (event.clientY / window.innerHeight - 0.5) * 2;
			kick();
		};
		const onScroll = () => {
			target.s = Math.min(1, window.scrollY / Math.max(1, window.innerHeight));
			kick();
		};
		const onMotion = () => {
			reduceMotion = motionQuery.matches;
			if (reduceMotion) {
				Object.assign(target, { x: 0, y: 0, s: 0 });
				Object.assign(current, target);
				if (layer) layer.style.transform = '';
				if (glow) glow.style.transform = '';
			}
		};
		window.addEventListener('pointermove', onPointer, { passive: true });
		window.addEventListener('scroll', onScroll, { passive: true });
		motionQuery.addEventListener('change', onMotion);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('pointermove', onPointer);
			window.removeEventListener('scroll', onScroll);
			motionQuery.removeEventListener('change', onMotion);
		};
	});

	// "Neutral" (no single measurement chosen) uses a navy/teal duotone of the optical panel —
	// a stylised treatment, not another measurement depiction.
	let key = $derived(family === 'neutral' ? 'neutral' : `${family}-${detail}`);
	let src = $derived(family === 'neutral' ? '/images/purpose-journey/optical-fine.webp' : `/images/purpose-journey/${family}-${detail}.webp`);
	let duration = $derived(reduceMotion ? 0 : 420);
</script>

<div class="backdrop" aria-hidden="true">
	<div class="stage">
		<div class="gradient"></div>
		<div class="frame-box">
			<div class="layer" bind:this={layer}>
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
		</div>
		<div class="glow" bind:this={glow}></div>
		<div class="scrim"></div>
	</div>
</div>

<style>
	/* Spans the whole entry; the sticky stage inside keeps the scene in view while scrolling. */
	.backdrop {
		position: absolute;
		inset: 0;
		z-index: 0;
		overflow: clip;
		background: #060b16;
		pointer-events: none;
	}
	.stage {
		position: sticky;
		top: var(--nav-height, 56px);
		height: calc(100svh - var(--nav-height, 56px));
		overflow: hidden;
	}
	.gradient {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(90% 80% at 82% 22%, rgb(20 72 88 / 0.5), transparent 62%),
			linear-gradient(165deg, #0a1426 0%, #060b16 72%);
	}
	/* Fixed-aspect frame at the top right: identical framing in every state, at most ~1.8×
	   the 600 × 330 source. Soft-edged so it reads as atmosphere rather than a picture box. */
	.frame-box {
		position: absolute;
		top: 0;
		right: 0;
		width: min(66vw, 1080px);
		aspect-ratio: 600 / 330;
		-webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 38%), linear-gradient(180deg, #000 45%, transparent 96%);
		-webkit-mask-composite: source-in;
		mask-image: linear-gradient(90deg, transparent 0%, #000 38%), linear-gradient(180deg, #000 45%, transparent 96%);
		mask-composite: intersect;
	}
	.layer {
		position: absolute;
		inset: 0;
		transform: scale(1.06);
		will-change: transform;
	}
	.scene {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		filter: saturate(0.9) contrast(1.04) brightness(0.92);
	}
	.scene.neutral {
		filter: grayscale(1) sepia(0.35) hue-rotate(150deg) saturate(1.6) brightness(0.6) contrast(1.05);
	}
	/* A soft light that moves against the scene, adding depth without extra imagery. */
	.glow {
		position: absolute;
		top: -10%;
		right: 8%;
		width: 46vw;
		height: 46vw;
		max-width: 720px;
		max-height: 720px;
		border-radius: 50%;
		background: radial-gradient(closest-side, rgb(110 231 214 / 0.12), transparent);
		mix-blend-mode: screen;
	}
	/* Stable navy scrim protecting text and controls in every image state and theme. */
	.scrim {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(90deg, #060b16 0%, rgb(6 11 22 / 0.9) 30%, rgb(6 11 22 / 0.5) 58%, rgb(6 11 22 / 0.18) 100%),
			linear-gradient(0deg, rgb(6 11 22 / 0.9) 0%, transparent 45%);
	}
	@media (max-width: 767px) {
		.frame-box {
			width: 150%;
			opacity: 0.55;
		}
		.glow {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.layer,
		.glow {
			transform: none !important;
		}
	}
</style>
