<script lang="ts">
	import { signed, type CqasReport } from '$lib/domain/cqas';
	import ChartTip from './ChartTip.svelte';
	import { niceTicks, tickLabel, type Tip } from './chart';

	let { report, k }: { report: CqasReport; k: 1 | 2 } = $props();
	const W = 460;
	const H = 236;
	const M = { l: 50, r: 14, t: 32, b: 42 };

	let rad = $derived(report.radiometric);
	let bands = $derived(rad.bands);
	let n = $derived(bands.length);
	// Axis covers k = 2 so it does not jump when the coverage factor changes.
	let scale = $derived(niceTicks(Math.min(0, ...bands.map((b) => b.difference - 2 * b.uncertainty_k1)), Math.max(0, ...bands.map((b) => b.difference + 2 * b.uncertainty_k1)), 3));
	let x = $derived((i: number) => (n === 1 ? (M.l + W - M.r) / 2 : M.l + 40 + (i * (W - M.l - M.r - 80)) / (n - 1)));
	let y = $derived((value: number) => H - M.b - ((value - scale.lo) / (scale.hi - scale.lo)) * (H - M.t - M.b));
	let current = $state(-1);
	let tip = $derived.by<Tip | null>(() => {
		const band = bands[current];
		if (!band) return null;
		const U = band.uncertainty_k1 * k;
		const includesZero = band.difference - U <= 0 && band.difference + U >= 0;
		const name = band.band === rad.headline_band && rad.headline_band_name ? `${band.band} (${rad.headline_band_name})` : band.band;
		return {
			x: (x(current) / W) * 100,
			y: ((y(band.difference) - 8) / H) * 100,
			title: name,
			lines: [`Difference: ${signed(band.difference)}`, `Uncertainty: ±${U.toFixed(3)} (k = ${k})`],
			note: `${signed(band.difference - U)} to ${signed(band.difference + U)}; ${includesZero ? 'includes' : 'excludes'} zero`
		};
	});
</script>

<div class="cq-chart">
	<svg viewBox="0 0 {W} {H}" role="group" aria-label="{report.pfs.short_name} difference by band with uncertainty whiskers, k = {k}">
		<g class="grid">
			{#each scale.ticks as t (t)}<line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} class:zero={t === 0} />{/each}
		</g>
		{#each scale.ticks as t (t)}<text x={M.l - 8} y={y(t) + 4} text-anchor="end">{tickLabel(t, true)}</text>{/each}
		<text x="2" y="12">{report.pfs.short_name} difference</text>
		<text x={(M.l + W - M.r) / 2} y={H - 4} text-anchor="middle">Band · whiskers: uncertainty, k = {k}</text>
		{#each bands as band, i (band.band)}
			{@const U = band.uncertainty_k1 * k}
			<text x={x(i)} y={H - M.b + 18} text-anchor="middle">{band.band}</text>
			<line x1={x(i)} x2={x(i)} y1={y(band.difference - U)} y2={y(band.difference + U)} class="whisker" />
			{#each [band.difference - U, band.difference + U] as end, j (j)}<line x1={x(i) - 6} x2={x(i) + 6} y1={y(end)} y2={y(end)} class="whisker" />{/each}
			<circle cx={x(i)} cy={y(band.difference)} r="5" class="pt" class:on={i === current} />
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<rect
				x={x(i) - 26}
				y={M.t}
				width="52"
				height={H - M.t - M.b}
				class="hit"
				tabindex="0"
				role="img"
				aria-label="{band.band}: {signed(band.difference)}, uncertainty ±{U.toFixed(3)} at k = {k}"
				onmouseenter={() => (current = i)}
				onmouseleave={() => (current = -1)}
				onfocus={() => (current = i)}
				onblur={() => (current = -1)}
			/>
		{/each}
	</svg>
	<ChartTip {tip} />
</div>
