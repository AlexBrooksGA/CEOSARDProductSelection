<script lang="ts">
	import { formatNumber, geometricMetres, type CqasReport } from '$lib/domain/cqas';
	import ChartTip from './ChartTip.svelte';
	import { niceTicks, tickLabel, type Tip } from './chart';

	let { report }: { report: CqasReport } = $props();
	const W = 560;
	const H = 90;
	const L = 8;
	const R = W - 12;
	const Y = 40;

	let g = $derived(report.geometric);
	let value = $derived(geometricMetres(report));
	let limit = $derived(g.limit_px === null ? null : g.limit_px * g.pixel_size_m);
	let scale = $derived(niceTicks(0, Math.max(value, limit ?? 0) * 1.2, 4));
	let x = $derived((v: number) => L + (v / scale.hi) * (R - L));
	let label = $derived(
		`${formatNumber(value)} metres relative error${limit === null ? '' : `; numeric limit ${formatNumber(limit)} metres (${g.limit_px} pixel)`}`
	);
	let tip = $state<Tip | null>(null);
	let active = $state(false);

	function show() {
		active = true;
		const lines = [`${formatNumber(g.radial_rmse_px, 2)} pixel on a native ${g.pixel_size_m} m grid`];
		let note: string | undefined;
		if (limit !== null) note = value <= limit ? `${formatNumber(limit - value)} m inside the ${formatNumber(limit)} m numeric limit` : `${formatNumber(value - limit)} m above the ${formatNumber(limit)} m numeric limit`;
		tip = { x: (x(value) / W) * 100, y: ((Y - 8) / H) * 100, title: `${formatNumber(value)} m relative error`, lines, note };
	}
	function hide() {
		active = false;
		tip = null;
	}
</script>

<div class="cq-chart">
	<svg viewBox="0 0 {W} {H}" role="group" aria-label="Relative geometric error compared with the numeric limit">
		<rect x={L} y={Y - 5} width={R - L} height="10" rx="5" class="track" />
		<rect x={L} y={Y - 5} width={Math.max(0, x(value) - L)} height="10" rx="5" class="fill" />
		{#if limit !== null}
			<line x1={x(limit)} x2={x(limit)} y1={Y - 16} y2={Y + 16} class="limit" />
			<text x={x(limit)} y={Y - 22} text-anchor="middle" class="limit-lbl">Limit {formatNumber(limit)} m ({g.limit_px} pixel)</text>
		{/if}
		{#each scale.ticks.filter((t) => t <= scale.hi) as t (t)}
			<text x={x(t)} y={Y + 33} text-anchor={t ? 'middle' : 'start'}>{tickLabel(t)} m</text>
		{/each}
		<circle cx={x(value)} cy={Y} r={active ? 7 : 6} class="pt" />
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<rect
			x={L}
			y={Y - 16}
			width={x(value) - L + 10}
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
