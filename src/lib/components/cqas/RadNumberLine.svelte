<script lang="ts">
	import { channelLabel, radUncertainty, radValue, signed, type CqasChannel, type CqasRadiometric } from '$lib/domain/cqas';
	import ChartTip from './ChartTip.svelte';
	import { niceTicks, tickLabel, type Tip } from './chart';

	let { rad, channel }: { rad: CqasRadiometric; channel: CqasChannel } = $props();
	let width = $state(560);
	let W = $derived(Math.max(280, Math.round(width)));
	const H = 86;
	const L = 8;
	let R = $derived(W - 12);
	const Y = 38;

	let v = $derived(channel.difference);
	let u = $derived(channel.uncertainty_k1);
	let scale = $derived(niceTicks(Math.min(0, v - u) - u, Math.max(0, v + u) + u, W < 420 ? 2 : 3));
	let x = $derived((value: number) => L + ((value - scale.lo) / (scale.hi - scale.lo)) * (R - L));
	let label = $derived(`Difference ${radValue(rad, v)} with uncertainty ${radUncertainty(rad, u)} (k = 1); zero means the same as the reference`);
	let tip = $state<Tip | null>(null);

	function show() {
		const name = channelLabel(channel);
		tip = {
			x: (x(v) / W) * 100,
			y: ((Y - 8) / H) * 100,
			title: `${radValue(rad, v)} ${rad.short_quantity} difference`,
			lines: [`${name[0]!.toUpperCase()}${name.slice(1)}`],
			note: `${radUncertainty(rad, u)} (k = 1): ${signed(v - u, rad.decimals)} to ${signed(v + u, rad.decimals)}`
		};
	}
	function hide() {
		tip = null;
	}
</script>

<div class="cq-chart" bind:clientWidth={width}>
	<svg viewBox="0 0 {W} {H}" role="group" aria-label="{rad.short_quantity} difference from the reference, {channel.channel}">
		<line x1={L} x2={R} y1={Y} y2={Y} class="zero" />
		<line x1={x(0)} x2={x(0)} y1={Y - 15} y2={Y + 15} class="zero" />
		<text x={x(0)} y={Y - 21} text-anchor="middle">0 = same as reference</text>
		<line x1={x(v - u)} x2={x(v + u)} y1={Y} y2={Y} class="whisker" stroke-width="3" />
		{#each [v - u, v + u] as end, i (i)}<line x1={x(end)} x2={x(end)} y1={Y - 7} y2={Y + 7} class="whisker" />{/each}
		{#each scale.ticks as t, i (t)}
			<text x={x(t)} y={Y + 32} text-anchor={i === 0 ? 'start' : i === scale.ticks.length - 1 ? 'end' : 'middle'}>{tickLabel(t, true)}</text>
		{/each}
		<circle cx={x(v)} cy={Y} r={tip ? 7 : 6} class="pt" />
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<rect
			x={x(v - u) - 6}
			y={Y - 16}
			width={x(v + u) - x(v - u) + 12}
			height="32"
			class="hit"
			tabindex="0"
			role="img"
			aria-label={label}
			onmouseenter={show}
			onmouseleave={hide}
			onfocus={show}
			onblur={hide}
		/>
	</svg>
	<ChartTip {tip} />
</div>
