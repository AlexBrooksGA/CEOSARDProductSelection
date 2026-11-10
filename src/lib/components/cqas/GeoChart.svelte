<script lang="ts">
	import { formatNumber, type CqasReport } from '$lib/domain/cqas';
	import ChartTip from './ChartTip.svelte';
	import { niceTicks, type Tip } from './chart';

	let { report, unit }: { report: CqasReport; unit: 'px' | 'm' } = $props();
	let width = $state(460);
	let W = $derived(Math.max(280, Math.round(width)));
	const H = 230;
	const M = { l: 44, r: 14, t: 28, b: 42 };

	let g = $derived(report.geometric);
	let item = $derived(g.kind === 'absolute' ? 'Reflector' : 'Comparison');
	let k = $derived(unit === 'px' ? 1 : g.pixel_size_m);
	let unitName = $derived(unit === 'px' ? 'pixel' : 'm');
	let values = $derived(g.comparisons_px.map((value) => value * k));
	let limit = $derived(g.limit_px === null ? null : g.limit_px * k);
	let scale = $derived(niceTicks(0, Math.max(...values, limit ?? 0) * 1.15, 3));
	let n = $derived(values.length);
	let x = $derived((i: number) => (n === 1 ? (M.l + W - M.r) / 2 : M.l + 14 + (i * (W - M.l - M.r - 28)) / (n - 1)));
	let y = $derived((value: number) => H - M.b - (value / scale.hi) * (H - M.t - M.b));
	let label = $derived(
		`Radial error for ${n} ${g.kind === 'absolute' ? 'corner reflectors' : `${g.comparison.toLowerCase()} comparisons`} in ${unitName}${limit === null ? '' : `; ${g.limit_source ?? 'Numeric'} limit ${formatNumber(limit, 2)} ${unitName}`}`
	);
	let current = $state(-1);
	let tip = $derived<Tip | null>(
		current < 0 || current >= n
			? null
			: {
					x: (x(current) / W) * 100,
					y: ((y(values[current]!) - 8) / H) * 100,
					title: `${item} ${current + 1}`,
					lines: [`${g.comparisons_px[current]!.toFixed(2)} pixel · ${(g.comparisons_px[current]! * g.pixel_size_m).toFixed(1)} m`],
					note: g.limit_px === null ? undefined : `${g.comparisons_px[current]! <= g.limit_px ? 'Within' : 'Above'} the ${g.limit_px} pixel numeric limit`
				}
	);
	let svg: SVGSVGElement | undefined = $state();

	function nearest(event: MouseEvent) {
		if (!svg) return;
		const box = svg.getBoundingClientRect();
		const sx = ((event.clientX - box.left) * W) / box.width;
		let best = 0;
		for (let i = 1; i < n; i++) if (Math.abs(x(i) - sx) < Math.abs(x(best) - sx)) best = i;
		current = best;
	}
	let focused = $state(false);
	function key(event: KeyboardEvent) {
		const next: Record<string, number> = { ArrowRight: current + 1, ArrowUp: current + 1, ArrowLeft: current - 1, ArrowDown: current - 1, Home: 0, End: n - 1 };
		if (!(event.key in next)) return;
		event.preventDefault();
		current = Math.min(n - 1, Math.max(0, next[event.key]!));
	}
</script>

<div class="cq-chart" bind:clientWidth={width}>
	<svg bind:this={svg} viewBox="0 0 {W} {H}" role="group" aria-label={label}>
		<g class="grid">
			{#each scale.ticks as t (t)}<line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} />{/each}
		</g>
		{#each scale.ticks as t (t)}<text x={M.l - 8} y={y(t) + 4} text-anchor="end">{formatNumber(t, 2)}</text>{/each}
		<text x="2" y="12">{unitName}</text>
		{#if limit !== null}
			<line x1={M.l} x2={W - M.r} y1={y(limit)} y2={y(limit)} class="limit" />
			<text x={M.l + 4} y={y(limit) - 8} class="limit-lbl">{g.limit_source ?? 'Numeric'} limit: {formatNumber(limit, 2)} {unitName}</text>
		{/if}
		{#each values as _, i (i)}<text x={x(i)} y={H - M.b + 18} text-anchor="middle">{i + 1}</text>{/each}
		<text x={(M.l + W - M.r) / 2} y={H - 4} text-anchor="middle">{g.kind === 'absolute' ? 'Corner reflector (no order)' : `${g.comparison} comparison (no order)`}</text>
		{#if current >= 0}<line x1={x(current)} x2={x(current)} y1={M.t} y2={H - M.b} class="cross" />{/if}
		{#each values as value, i (i)}<circle cx={x(i)} cy={y(value)} r="5" class="pt" class:on={i === current} />{/each}
		<rect
			x={M.l}
			y={M.t}
			width={W - M.l - M.r}
			height={H - M.t - M.b}
			class="hit"
			tabindex="0"
			role="slider"
			aria-label="{item}; use the arrow keys, Home and End to step through them"
			aria-valuemin={1}
			aria-valuemax={n}
			aria-valuenow={Math.max(current, 0) + 1}
			aria-valuetext={tip ? `${tip.title}: ${tip.lines[0]}` : undefined}
			onmousemove={nearest}
			onmouseleave={() => {
				if (!focused) current = -1;
			}}
			onfocus={() => {
				focused = true;
				current = Math.max(current, 0);
			}}
			onblur={() => {
				focused = false;
				current = -1;
			}}
			onkeydown={key}
		/>
	</svg>
	<ChartTip {tip} />
</div>
