<script lang="ts">
	import { seriesStats, seriesValue, signed, type CqasSeries } from '$lib/domain/cqas';
	import ChartTip from './ChartTip.svelte';
	import { niceTicks, tickLabel, type Tip } from './chart';

	/**
	 * One test repeated over many scenes. One colour; each site has its own marker shape, so sites
	 * are never told apart by colour alone. `site` limits the points to one site.
	 */
	let { series, site = null, compact = false }: { series: CqasSeries; site?: string | null; compact?: boolean } = $props();
	let width = $state(560);
	let W = $derived(Math.max(280, Math.round(width)));
	let H = $derived(compact ? 120 : 240);
	let M = $derived(compact ? { l: 46, r: 12, t: 14, b: 24 } : { l: 52, r: 14, t: 24, b: 40 });

	let points = $derived(site ? series.points.filter((point) => point.site === site) : series.points);
	let stats = $derived(seriesStats(series, site));
	let times = $derived(points.map((point) => Date.parse(`${point.date}T00:00:00Z`)));
	let t0 = $derived(Math.min(...times));
	let t1 = $derived(Math.max(...times));
	let span = $derived(Math.max(t1 - t0, 30 * 86400000));
	let pad = $derived(span * 0.04);
	let x = $derived((t: number) => M.l + ((t - t0 + pad) / (span + 2 * pad)) * (W - M.l - M.r));
	let showWhiskers = $derived(!compact);
	let lo = $derived(Math.min(0, ...points.map((p) => p.value - (showWhiskers ? p.uncertainty_k1 : 0))));
	let hi = $derived(Math.max(0, ...points.map((p) => p.value + (showWhiskers ? p.uncertainty_k1 : 0))));
	let scale = $derived(niceTicks(lo, hi, compact ? 2 : 4));
	let y = $derived((value: number) => H - M.b - ((value - scale.lo) / (scale.hi - scale.lo)) * (H - M.t - M.b));
	let siteIndex = $derived(new Map(series.sites.map((s, i) => [s.code, i])));
	let siteName = $derived(new Map(series.sites.map((s) => [s.code, s.name])));

	/** Year ticks, or quarter ticks for a short series. */
	let xTicks = $derived.by(() => {
		const ticks: { t: number; label: string }[] = [];
		const start = new Date(t0 - pad);
		const end = t1 + pad;
		if (span > 420 * 86400000) {
			for (let year = start.getUTCFullYear() + 1; Date.UTC(year, 0, 1) <= end; year += 1) ticks.push({ t: Date.UTC(year, 0, 1), label: String(year) });
		} else {
			for (let m = start.getUTCFullYear() * 12 + start.getUTCMonth() + 1; ; m += 1) {
				const t = Date.UTC(Math.floor(m / 12), m % 12, 1);
				if (t > end) break;
				if (m % 3 === 0) ticks.push({ t, label: new Date(t).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) });
			}
		}
		return W < 420 && ticks.length > 4 ? ticks.filter((_, i) => i % 2 === 0) : ticks;
	});

	let current = $state(-1);
	let tip = $derived.by<Tip | null>(() => {
		const point = points[current];
		if (!point) return null;
		return {
			x: (x(times[current]!) / W) * 100,
			y: ((y(point.value) - 8) / H) * 100,
			title: `${point.date} · ${siteName.get(point.site) ?? point.site}`,
			lines: [`${seriesValue(series, point.value)}`],
			note: `±${point.uncertainty_k1.toFixed(series.decimals)} (k = 1)`
		};
	});
	let svg: SVGSVGElement | undefined = $state();
	let focused = $state(false);

	function nearest(event: MouseEvent) {
		if (!svg || !points.length) return;
		const box = svg.getBoundingClientRect();
		const sx = ((event.clientX - box.left) * W) / box.width;
		let best = 0;
		for (let i = 1; i < points.length; i++) if (Math.abs(x(times[i]!) - sx) < Math.abs(x(times[best]!) - sx)) best = i;
		current = best;
	}
	function key(event: KeyboardEvent) {
		const n = points.length;
		const next: Record<string, number> = { ArrowRight: current + 1, ArrowUp: current + 1, ArrowLeft: current - 1, ArrowDown: current - 1, Home: 0, End: n - 1 };
		if (!(event.key in next)) return;
		event.preventDefault();
		current = Math.min(n - 1, Math.max(0, next[event.key]!));
	}
	$effect(() => {
		void site;
		current = -1;
	});
</script>

{#snippet marker(index: number, cx: number, cy: number, r: number, on = false)}
	{#if index % 4 === 1}
		<rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx="1.5" class="pt" class:on />
	{:else if index % 4 === 2}
		<path d="M{cx} {cy - r * 1.2} L{cx + r * 1.15} {cy + r * 0.9} L{cx - r * 1.15} {cy + r * 0.9} Z" class="pt" class:on />
	{:else if index % 4 === 3}
		<path d="M{cx} {cy - r * 1.25} L{cx + r * 1.25} {cy} L{cx} {cy + r * 1.25} L{cx - r * 1.25} {cy} Z" class="pt" class:on />
	{:else}
		<circle {cx} {cy} {r} class="pt" class:on />
	{/if}
{/snippet}

<div class="cq-chart" bind:clientWidth={width}>
	{#if points.length && stats}
		<svg bind:this={svg} viewBox="0 0 {W} {H}" role="group" aria-label="{series.description} for {stats.scenes} scenes from {stats.start} to {stats.end}; mean {seriesValue(series, stats.mean)}">
			<g class="grid">
				{#each scale.ticks as t (t)}<line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} class:zero={t === 0} />{/each}
			</g>
			{#each scale.ticks as t (t)}<text x={M.l - 8} y={y(t) + 4} text-anchor="end">{series.units === 'm' ? tickLabel(t) : tickLabel(t, true)}</text>{/each}
			{#if !compact}<text x="2" y="12">{series.units === '1' ? 'difference' : series.units === 'm' ? 'metres' : `difference (${series.units})`}</text>{/if}
			{#each xTicks as tick (tick.t)}<text x={x(tick.t)} y={H - M.b + 16} text-anchor="middle">{tick.label}</text>{/each}
			{#if series.test === 'radiometric'}
				<line x1={M.l} x2={W - M.r} y1={y(stats.mean)} y2={y(stats.mean)} class="mean" />
			{/if}
			{#if showWhiskers}
				{#each points as point, i (i)}
					<line x1={x(times[i]!)} x2={x(times[i]!)} y1={y(point.value - point.uncertainty_k1)} y2={y(point.value + point.uncertainty_k1)} class="whisker faint" />
				{/each}
			{/if}
			{#if current >= 0}<line x1={x(times[current]!)} x2={x(times[current]!)} y1={M.t} y2={H - M.b} class="cross" />{/if}
			{#each points as point, i (i)}
				{@render marker(siteIndex.get(point.site) ?? 0, x(times[i]!), y(point.value), compact ? 3.5 : 4.5, i === current)}
			{/each}
			<rect
				x={M.l}
				y={M.t}
				width={W - M.l - M.r}
				height={H - M.t - M.b}
				class="hit"
				tabindex="0"
				role="slider"
				aria-label="Scene; use the arrow keys, Home and End to step through scenes"
				aria-valuemin={1}
				aria-valuemax={points.length}
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
		{#if (series.sites.length > 1 && !site) || series.test === 'radiometric'}
			<ul class="cq-series-legend" aria-label="Legend">
				{#if !site}
					{#each series.sites.length > 1 ? series.sites : [] as s, i (s.code)}
						<li><svg viewBox="0 0 14 14" aria-hidden="true">{@render marker(i, 7, 7, 4.5)}</svg>{s.name}</li>
					{/each}
				{/if}
				{#if series.test === 'radiometric'}<li><svg viewBox="0 0 18 14" aria-hidden="true"><line x1="0" x2="18" y1="7" y2="7" class="mean" /></svg>Mean {signed(stats.mean, series.decimals)}</li>{/if}
			</ul>
		{/if}
		<ChartTip {tip} />
	{/if}
</div>

<style>
	.cq-series-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		margin: 4px 0 0;
		padding: 0;
		list-style: none;
		font-size: 0.82rem;
		color: var(--text-secondary);
	}
	.cq-series-legend li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.cq-series-legend svg {
		width: 18px;
		height: 14px;
		overflow: visible;
	}
	:global(.cq-chart .mean) {
		stroke: var(--text-secondary);
		stroke-width: 1.5;
		stroke-dasharray: 2 4;
	}
	:global(.cq-chart .whisker.faint) {
		opacity: 0.35;
		stroke-width: 1.5;
	}
</style>
