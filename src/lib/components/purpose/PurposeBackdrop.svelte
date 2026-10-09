<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { VisualDetail, VisualFamily } from '$lib/domain/purpose';
	import { DepthScene, IMAGE_BASE, type SceneLook } from './depth-scene';

	/**
	 * Decorative, illustrative background. It reflects the chosen measurement and detail as a
	 * qualitative cue only; it never feeds filtering and is hidden from assistive technology.
	 *
	 * The stage is sticky and full-bleed. On desktops with a fine pointer, a WebGL scene
	 * displaces the picture by its depth map as the cursor moves. Everywhere else — touch,
	 * reduced motion, no WebGL, a failed texture or a lost context — a still image is shown.
	 */
	let { family, detail }: { family: VisualFamily; detail: VisualDetail } = $props();
	let reduceMotion = $state(false);
	let failed = $state<Record<string, boolean>>({});
	let mode = $state<'still' | 'gl'>('still');
	let stage: HTMLDivElement | undefined = $state();
	let canvas: HTMLCanvasElement | undefined = $state();
	let scene: DepthScene | null = null;

	let look = $derived<SceneLook>(family === 'neutral' ? 'optical' : family);
	let neutral = $derived(family === 'neutral');
	let coarse = $derived(detail === 'coarse');
	let key = $derived(`${family}-${detail}`);
	let duration = $derived(reduceMotion ? 0 : 420);
	const srcset = (name: SceneLook) => `${IMAGE_BASE}/${name}-1280.webp 1280w, ${IMAGE_BASE}/${name}-1920.webp 1920w, ${IMAGE_BASE}/${name}-2560.webp 2560w`;
	const portraitSrcset = (name: SceneLook) => `${IMAGE_BASE}/${name}-portrait-720.webp 720w, ${IMAGE_BASE}/${name}-portrait-1080.webp 1080w`;

	onMount(() => {
		const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
		const pointerQuery = matchMedia('(hover: hover) and (pointer: fine)');
		reduceMotion = motionQuery.matches;
		let observer: ResizeObserver | undefined;

		const stop = () => {
			scene?.destroy();
			scene = null;
			observer?.disconnect();
			mode = 'still';
		};
		const startScene = async () => {
			if (scene || reduceMotion || !pointerQuery.matches || !canvas || !stage) return;
			const created = DepthScene.create(canvas);
			if (!created) return;
			scene = created;
			created.onfail = stop;
			const rect = stage.getBoundingClientRect();
			created.resize(rect.width, rect.height, devicePixelRatio);
			observer = new ResizeObserver(([entry]) => {
				if (entry) scene?.resize(entry.contentRect.width, entry.contentRect.height, devicePixelRatio);
			});
			observer.observe(stage);
			try {
				// Same width the still image's srcset picks, so the first texture comes from cache.
				await created.start({ look, neutral, coarse }, rect.width * devicePixelRatio);
				if (scene === created) mode = 'gl';
			} catch {
				if (scene === created) stop();
			}
		};
		const onPointer = (event: PointerEvent) => {
			scene?.setPointer((event.clientX / window.innerWidth - 0.5) * 2, (event.clientY / window.innerHeight - 0.5) * 2);
		};
		const onScroll = () => scene?.setScroll(Math.min(1, window.scrollY / Math.max(1, window.innerHeight)));
		const onPreference = () => {
			reduceMotion = motionQuery.matches;
			if (reduceMotion || !pointerQuery.matches) stop();
			else void startScene();
		};
		window.addEventListener('pointermove', onPointer, { passive: true });
		window.addEventListener('scroll', onScroll, { passive: true });
		motionQuery.addEventListener('change', onPreference);
		pointerQuery.addEventListener('change', onPreference);
		void startScene();
		return () => {
			stop();
			window.removeEventListener('pointermove', onPointer);
			window.removeEventListener('scroll', onScroll);
			motionQuery.removeEventListener('change', onPreference);
			pointerQuery.removeEventListener('change', onPreference);
		};
	});

	$effect(() => {
		const state = { look, neutral, coarse };
		if (mode === 'gl') void scene?.show(state, !reduceMotion);
	});
</script>

<div class="backdrop" aria-hidden="true">
	<div class="stage" bind:this={stage}>
		<div class="gradient"></div>
		<div class="still" class:hidden={mode === 'gl'}>
			{#key key}
				{#if !failed[key]}
					<div class="scene-wrap" in:fade={{ duration }} out:fade={{ duration }}>
						{#if coarse}
							<img class="scene coarse" class:neutral src="{IMAGE_BASE}/{look}-coarse.png" alt="" width="160" height="90" decoding="async" onerror={() => (failed = { ...failed, [key]: true })} />
						{:else}
							<picture>
								<source media="(orientation: portrait) and (max-width: 900px)" srcset={portraitSrcset(look)} sizes="100vw" />
								<img
									class="scene"
									class:neutral
									srcset={srcset(look)}
									sizes="100vw"
									src="{IMAGE_BASE}/{look}-1920.webp"
									alt=""
									width="1920"
									height="1080"
									decoding="async"
									fetchpriority="high"
									onerror={() => (failed = { ...failed, [key]: true })}
								/>
							</picture>
						{/if}
					</div>
				{/if}
			{/key}
		</div>
		<canvas class="gl" class:visible={mode === 'gl'} bind:this={canvas}></canvas>
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
	.still,
	.scene-wrap,
	.gl {
		position: absolute;
		inset: 0;
	}
	.still.hidden {
		visibility: hidden;
	}
	.scene-wrap :global(picture) {
		display: contents;
	}
	.scene {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 64% 50%;
	}
	.scene.coarse {
		image-rendering: pixelated;
	}
	.scene.neutral {
		filter: grayscale(1) sepia(0.35) hue-rotate(150deg) saturate(1.4) brightness(0.72) contrast(1.05);
	}
	.gl {
		width: 100%;
		height: 100%;
		opacity: 0;
		transition: opacity 600ms ease;
	}
	.gl.visible {
		opacity: 1;
	}
	/* Stable navy scrim protecting text and controls in every image state and theme. */
	.scrim {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(90deg, rgb(6 11 22 / 0.94) 0%, rgb(6 11 22 / 0.86) 28%, rgb(6 11 22 / 0.62) 54%, rgb(6 11 22 / 0.26) 80%, rgb(6 11 22 / 0.3) 100%),
			linear-gradient(0deg, rgb(6 11 22 / 0.88) 0%, transparent 32%),
			linear-gradient(180deg, rgb(6 11 22 / 0.45) 0%, transparent 18%);
	}
	@media (max-width: 767px) {
		/* The sentence spans the full width on phones: an even, deeper scrim. */
		.scrim {
			background:
				linear-gradient(180deg, rgb(6 11 22 / 0.72) 0%, rgb(6 11 22 / 0.82) 100%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.gl {
			transition: none;
		}
	}
</style>
