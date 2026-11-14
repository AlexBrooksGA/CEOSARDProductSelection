<script lang="ts">
	import { channelLabel, radUncertainty, radValue, signed, unitSuffix, type CqasRadiometric } from '$lib/domain/cqas';
	import ChartTip from './ChartTip.svelte';
	import { niceTicks, tickLabel, type Tip } from './chart';

	let { rad, k }: { rad: CqasRadiometric; k: 1 | 2 } = $props();
	let width = $state(460);
	let W = $derived(Math.max(280, Math.round(width)));
	const H = 236;
	const M = { l: 50, r: 14, t: 32, b: 50 };

	let channels = $derived(rad.channels);
	let n = $derived(channels.length);
	// Axis covers k = 2 so it does not jump when the coverage factor changes.
	let scale = $derived(niceTicks(Math.min(0, ...channels.map((c) => c.difference - 2 * c.uncertainty_k1)), Math.max(0, ...channels.map((c) => c.difference + 2 * c.uncertainty_k1)), 3));
	let pad = $derived(n === 1 ? 0 : Math.min(40, (W - M.l - M.r) / (n * 2)));
	let x = $derived((i: number) => (n === 1 ? (M.l + W - M.r) / 2 : M.l + pad + (i * (W - M.l - M.r - 2 * pad)) / (n - 1)));
	let y = $derived((value: number) => H - M.b - ((value - scale.lo) / (scale.hi - scale.lo)) * (H - M.t - M.b));
	let crowded = $derived(n > 1 && (W - M.l - M.r - 2 * pad) / (n - 1) < 7.5 * Math.max(...channels.map((c) => c.channel.length)));
	let hitWidth = $derived(Math.min(52, (W - M.l - M.r) / Math.max(n, 1)));
	let current = $state(-1);
	let tip = $derived.by<Tip | null>(() => {
		const channel = channels[current];
		if (!channel) return null;
		const U = channel.uncertainty_k1 * k;
		const includesZero = channel.difference - U <= 0 && channel.difference + U >= 0;
		const name = channelLabel(channel);
		return {
			x: (x(current) / W) * 100,
			y: ((y(channel.difference) - 8) / H) * 100,
			title: `${name[0]!.toUpperCase()}${name.slice(1)}`,
			lines: [`Difference: ${radValue(rad, channel.difference)}`, `Uncertainty: ${radUncertainty(rad, U)} (k = ${k})`],
			note: `${signed(channel.difference - U, rad.decimals)} to ${signed(channel.difference + U, rad.decimals)}; ${includesZero ? 'includes' : 'excludes'} zero`
		};
	});
</script>

<div class="cq-chart" bind:clientWidth={width}>
	<svg viewBox="0 0 {W} {H}" role="group" aria-label="{rad.short_quantity} difference by channel with uncertainty whiskers, k = {k}">
		<g class="grid">
			{#each scale.ticks as t (t)}<line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} class:zero={t === 0} />{/each}
		</g>
		{#each scale.ticks as t (t)}<text x={M.l - 8} y={y(t) + 4} text-anchor="end">{tickLabel(t, true)}</text>{/each}
		<text x="2" y="12">{rad.short_quantity} difference{unitSuffix(rad.units)}</text>
		<text x={(M.l + W - M.r) / 2} y={H - 4} text-anchor="middle">{W < 420 ? `Whiskers: k = ${k}` : `Channel · whiskers: uncertainty, k = ${k}`}</text>
		{#each channels as channel, i (channel.channel)}
			{@const U = channel.uncertainty_k1 * k}
			<!-- Stagger labels when they would touch -->
			<text x={x(i)} y={H - M.b + 18 + (crowded && i % 2 ? 12 : 0)} text-anchor="middle">{channel.channel}</text>
			<line x1={x(i)} x2={x(i)} y1={y(channel.difference - U)} y2={y(channel.difference + U)} class="whisker" />
			{#each [channel.difference - U, channel.difference + U] as end, j (j)}<line x1={x(i) - 6} x2={x(i) + 6} y1={y(end)} y2={y(end)} class="whisker" />{/each}
			<circle cx={x(i)} cy={y(channel.difference)} r="5" class="pt" class:on={i === current} />
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<rect
				x={x(i) - hitWidth / 2}
				y={M.t}
				width={hitWidth}
				height={H - M.t - M.b}
				class="hit"
				tabindex="0"
				role="img"
				aria-label="{channelLabel(channel)}: {radValue(rad, channel.difference)}, uncertainty {radUncertainty(rad, U)} at k = {k}"
				onmouseenter={() => (current = i)}
				onmouseleave={() => (current = -1)}
				onfocus={() => (current = i)}
				onblur={() => (current = -1)}
			/>
		{/each}
	</svg>
	<ChartTip {tip} />
</div>
