<script lang="ts">
	import './cqas.css';
	import {
		channelLabel,
		dataStatusLabel,
		findingCounts,
		FINDING_STATUSES,
		formatNumber,
		geometricMetres,
		geometricTerm,
		headlineChannel,
		pfsVersionDiffers,
		radUncertainty,
		radValue,
		relativePercent,
		seriesStats,
		exclusionExamples,
		seriesUncertainty,
		seriesValue,
		unitsDescription,
		type CqasReport,
		type FindingStatus
	} from '$lib/domain/cqas';
	import type { Product } from '$lib/domain/types';
	import { app } from '$lib/state/app.svelte';
	import GeoChart from './GeoChart.svelte';
	import GeoGauge from './GeoGauge.svelte';
	import RadChart from './RadChart.svelte';
	import RadNumberLine from './RadNumberLine.svelte';
	import RunCode from './RunCode.svelte';
	import SeriesChart from './SeriesChart.svelte';
	import StatusText from './StatusText.svelte';
	import { STATUS_META } from './chart';

	let { report, product }: { report: CqasReport; product: Product } = $props();
	const store = app();

	let mode = $derived(store.explorer.cqasDetail);
	let threshold = $derived(findingCounts(report, 'threshold'));
	let goal = $derived(findingCounts(report, 'goal'));
	let g = $derived(report.geometric);
	let rad = $derived(report.radiometric);
	let channel = $derived(headlineChannel(report));
	let series = $derived(report.series);
	let stats = $derived(series ? seriesStats(series) : null);
	let metres = $derived(geometricMetres(report));
	let term = $derived(geometricTerm(report));
	let versionDiffers = $derived(pfsVersionDiffers(report, product.pfs_version));
	let assessedVersion = $derived(product.pfs_version ? `v${product.pfs_version.trim().replace(/^v/i, '')}` : null);
	let filter = $state<'all' | FindingStatus>('all');
	let unit = $state<'px' | 'm'>('m');
	let k = $state<1 | 2>(1);
	let seriesSite = $state<string | null>(null);
	let siteStats = $derived(series ? seriesStats(series, seriesSite) : null);
	let rows = $derived(report.findings.filter((row) => filter === 'all' || row.threshold === filter || row.goal === filter));
	let stripOrder = $derived([...report.findings].sort((a, b) => FINDING_STATUSES.indexOf(a.threshold) - FINDING_STATUSES.indexOf(b.threshold)));
	let stripHover = $state<string | null>(null);
	let stripPicked = $state<string | null>(null);
	let stripRow = $derived(report.findings.find((item) => item.id === (stripHover ?? stripPicked)) ?? null);
	let geocorrName = $derived(report.findings.find((f) => f.id.startsWith('gcor-geo'))?.requirement ?? 'Geometric requirement');
	let percent = $derived(channel ? relativePercent(channel) : null);
	let isExample = $derived(report.data_status === 'example');
	let periodText = $derived(stats ? (stats.start.slice(0, 4) === stats.end.slice(0, 4) ? stats.start.slice(0, 4) : `${stats.start.slice(0, 4)}–${stats.end.slice(0, 4)}`) : '');

	/** Switch level; when the control that was used disappears, move focus to the section. */
	function setMode(next: 'simple' | 'advanced', moveFocus = false) {
		void store.patch((draft) => void (draft.cqasDetail = next), 'replace').then(() => {
			if (!moveFocus) return;
			const section = document.getElementById('cqas');
			section?.scrollIntoView({ block: 'start' });
			section?.focus({ preventScroll: true });
		});
	}
	function thresholdLabel(status: FindingStatus): string {
		return status === 'Not required' ? 'Not required at Threshold' : status;
	}
	function measuredLine(): string {
		if (g.limit_px === null) return 'No numeric limit agreed, so the value is reported only.';
		const limit = g.limit_px * g.pixel_size_m;
		if (g.numeric_test === 'Not assessed') return `Not tested against the ${formatNumber(limit)} m limit.`;
		return g.numeric_test === 'Met'
			? `Within the ${formatNumber(limit)} m limit (${g.limit_px} pixel, ${g.limit_source ?? 'numeric limit'}).`
			: `Above the ${formatNumber(limit)} m limit (${g.limit_px} pixel, ${g.limit_source ?? 'numeric limit'}).`;
	}
	function pct(value: number): string {
		return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}%`;
	}
</script>

<section class="panel stack cqas" id="cqas" tabindex="-1" aria-labelledby="cqas-heading">
	<div class="cq-head">
		<div class="stack-tight">
			<p class="label">Independent quality checks <span class="cq-proposed">Proposed</span></p>
			<h2 id="cqas-heading">C-QAS quality checks</h2>
		</div>
		<div class="segmented" role="radiogroup" aria-label="Level of detail">
			<label><input type="radio" name="cq-mode" value="simple" checked={mode === 'simple'} onchange={() => setMode('simple')} /><span>Simple</span></label>
			<label><input type="radio" name="cq-mode" value="advanced" checked={mode === 'advanced'} onchange={() => setMode('advanced')} /><span>Advanced</span></label>
		</div>
	</div>

	{#if report.data_status !== 'reviewed'}
		<div class="notice warn cq-banner" role="note">
			<strong>{dataStatusLabel(report.data_status)}</strong>
			<span>{report.status_note}</span>
		</div>
	{/if}
	{#if versionDiffers}
		<p class="notice cq-version"><strong>Different PFS version</strong><span>These checks use the {report.pfs.name} PFS v{report.pfs.version}. This product's CEOS-ARD assessment used {assessedVersion}, so the two may not line up requirement for requirement.</span></p>
	{/if}

	{#if mode === 'simple'}
		<div class="stack" data-mode="simple">
			<div class="cq-top">
				<div class="panel-subtle stack-tight">
					<p class="label">Standard PFS checks · Threshold</p>
					<p class="cq-big">{threshold.Met} Met <small>/</small> {threshold['Not met']} Not met</p>
					<p class="small cq-scope">Results for {report.findings_scope}</p>
					<p class="small secondary">
						{report.findings_summary}
						{#if threshold['Not required']}{threshold['Not required']} more checked requirement{threshold['Not required'] === 1 ? ' has' : 's have'} no Threshold level.{/if}
					</p>
					<ul class="cq-strip" aria-label="Threshold results for the {report.findings.length} checked requirements">
						{#each stripOrder as row (row.id)}
							{@const meta = STATUS_META[row.threshold]}
							<li>
								<button
									type="button"
									class={meta.cls}
									aria-pressed={stripPicked === row.id}
									aria-label="{row.requirement}: Threshold {thresholdLabel(row.threshold)}, Goal {row.goal}"
									onmouseenter={() => (stripHover = row.id)}
									onmouseleave={() => (stripHover = null)}
									onclick={() => (stripPicked = stripPicked === row.id ? null : row.id)}><span aria-hidden="true">{meta.icon}</span></button
								>
							</li>
						{/each}
					</ul>
					<p class="small cq-strip-detail" aria-live="polite">
						{#if stripRow}<strong>{stripRow.requirement}</strong> · Threshold: {thresholdLabel(stripRow.threshold)} · Goal: {stripRow.goal}{#if stripRow.reason} · {stripRow.reason}{/if}{:else}<span class="secondary">Select a square to see the requirement.</span>{/if}
					</p>
					<div class="cq-legend">
						{#each FINDING_STATUSES.filter((status) => threshold[status]) as status (status)}
							<span><i class="sw {STATUS_META[status].cls}"></i>{STATUS_META[status].icon} {thresholdLabel(status)} ({threshold[status]})</span>
						{/each}
					</div>
				</div>
				<div class="notice cq-provider">
					<strong>For the data provider</strong>
					<span>{report.next_action}</span>
					<span class="small secondary">Next steps for the provider. Missing evidence on its own does not mean the data are poor for your use.</span>
				</div>
			</div>

			<div class="cq-grid2">
				<div class="panel-subtle cq-card">
					<p class="label">Where are the pixels?</p>
					<p class="cq-big">{formatNumber(metres)} m <small>{term}</small></p>
					<GeoGauge {report} />
					<ul class="cq-results">
						<li><span class="cq-k">Measured value</span>{measuredLine()}</li>
						<li><span class="cq-k">PFS requirement</span><span>{geocorrName}: <StatusText status={g.requirement_result} />{#if g.requirement_reason}&nbsp;— {g.requirement_reason}{/if}</span></li>
					</ul>
					<p class="hint">
						{#if g.kind === 'absolute'}Absolute test: compared with surveyed corner reflector positions at {report.scene.reference_site?.name ?? 'the site'}.{:else}Relative test: compared with a repeat image from the same platform, not with ground positions.{/if}
					</p>
				</div>
				{#if rad && channel}
					<div class="panel-subtle cq-card">
						<p class="label">How close are the {rad.quantity} values?</p>
						<p class="cq-big">{radValue(rad, channel.difference)} <small>{rad.short_quantity} difference, {channelLabel(channel)}</small></p>
						<RadNumberLine {rad} {channel} />
						<ul class="cq-results">
							<li><span class="cq-k">Compared with</span>{rad.reference}, one scene ({report.scene.acquisition_date}){#if percent !== null}; {pct(percent)} of the reference value{/if}.</li>
							<li><span class="cq-k">Uncertainty</span>{radUncertainty(rad, channel.uncertainty_k1)} (k = 1), so the true difference is likely between {radValue(rad, channel.difference - channel.uncertainty_k1)} and {radValue(rad, channel.difference + channel.uncertainty_k1)}.</li>
							<li><span class="cq-k">Accuracy test</span><span><StatusText status={rad.accuracy_test} />{#if rad.accuracy_reason}&nbsp;— {rad.accuracy_reason}{/if}</span></li>
						</ul>
					</div>
				{:else}
					<div class="panel-subtle cq-card">
						<p class="label">Radiometric check</p>
						<p class="cq-big"><small>No test defined yet</small></p>
						<p class="small">{report.radiometric_note}</p>
					</div>
				{/if}
			</div>

			{#if series && stats}
				<div class="panel-subtle cq-card">
					<p class="label">Across scenes · {series.description}</p>
					<p>
						Over <strong>{stats.scenes} {series.test === 'geometric' ? 'measurements' : 'scenes'}</strong> at <strong>{stats.sites} site{stats.sites === 1 ? '' : 's'}</strong> ({periodText}),
						{#if series.test === 'radiometric'}the difference averaged <strong>{seriesValue(series, stats.mean)}</strong>, with a spread of {seriesUncertainty(series, stats.sd)} between scenes. {stats.withinK2} of {stats.scenes} scenes were within their own uncertainty (k = 2) of zero.{:else}the location error averaged <strong>{seriesValue(series, stats.mean)}</strong>, with a spread of {seriesUncertainty(series, stats.sd)}.{/if}
					</p>
					<SeriesChart {series} compact />
				</div>
			{/if}
			<p><button type="button" class="button plain" onclick={() => setMode('advanced', true)}>Show findings, plots and evidence →</button></p>
		</div>
	{:else}
		<div class="stack" data-mode="advanced">
			<h3>Input scene</h3>
			<div class="panel-subtle cq-card">
				<p class="label">{isExample ? 'Example input scene' : 'Input scene'}</p>
				<dl class="facts">
					<div class="fact cq-full"><dt>Scene ID</dt><dd class="mono cq-wrap">{report.scene.product_id}</dd></div>
					<div class="fact"><dt>Platform / instrument</dt><dd>{report.scene.platform} · {report.scene.instrument}</dd></div>
					<div class="fact"><dt>Acquisition date</dt><dd>{report.scene.acquisition_date}</dd></div>
					{#if report.scene.path !== null && report.scene.row !== null}<div class="fact"><dt>Path / Row</dt><dd>{report.scene.path} / {report.scene.row}</dd></div>{/if}
					{#if report.scene.reference_site}<div class="fact"><dt>Cal/val site</dt><dd>{report.scene.reference_site.name}<span class="basis">{report.scene.reference_site.network} · {report.scene.reference_site.code}</span></dd></div>{/if}
				</dl>
				{#if report.scene.note}<p class="hint">{report.scene.note}</p>{/if}
			</div>

			<div class="cq-counts">
				{#each [['Threshold', threshold], ['Goal', goal]] as const as [title, counts] (title)}
					<div class="panel-subtle stack-tight">
						<p class="label">{title}</p>
						<div class="row">
							{#each FINDING_STATUSES.filter((status) => counts[status]) as status (status)}<span><b>{counts[status]}</b> <StatusText {status} /></span>{/each}
						</div>
					</div>
				{/each}
			</div>

			<div class="cq-tools">
				<h3>PFS findings — checked requirements</h3>
				<div class="segmented cq-mini" role="radiogroup" aria-label="Show rows with">
					{#each ['all', ...FINDING_STATUSES] as const as value (value)}
						<label><input type="radio" name="cq-filter" {value} checked={filter === value} onchange={() => (filter = value)} /><span>{value === 'all' ? 'All' : value}</span></label>
					{/each}
				</div>
			</div>
			<p class="small secondary">Checked: {report.findings_scope}</p>
			<div class="cq-table-wrap">
				<table class="cq-table cq-findings">
					<caption class="visually-hidden">PFS findings for the checked requirements</caption>
					<thead><tr><th scope="col" style:width="50%">PFS requirement</th><th scope="col">Threshold</th><th scope="col">Goal</th></tr></thead>
					<tbody>
						{#each rows as row (row.id)}
							<tr>
								<th scope="row">{row.requirement}<span class="cq-id">{row.id}</span>{#if row.reason}<span class="cq-reason">{row.reason}</span>{/if}</th>
								<td><StatusText status={row.threshold} /></td>
								<td><StatusText status={row.goal} /></td>
							</tr>
						{:else}
							<tr><td colspan="3" class="missing">No checked requirement has this finding.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="hint" aria-live="polite">
				{rows.length} of {report.findings.length} checked requirements shown ({report.pfs.total_requirements} in the PFS). Met / Not met are assessed outcomes; Not assessed means not tested; Not required means the PFS has no requirement at that level.
			</p>

			<h3>Accuracy testing</h3>
			<div class="cq-grid2">
				<div class="panel-subtle cq-card">
					<div class="spread">
						<p class="label">Geometric accuracy</p>
						<div class="segmented cq-mini" role="radiogroup" aria-label="Units">
							<label><input type="radio" name="cq-unit" value="m" checked={unit === 'm'} onchange={() => (unit = 'm')} /><span>metres</span></label>
							<label><input type="radio" name="cq-unit" value="px" checked={unit === 'px'} onchange={() => (unit = 'px')} /><span>pixel</span></label>
						</div>
					</div>
					<p class="cq-big">{unit === 'm' ? `${formatNumber(metres)} m` : `${formatNumber(g.radial_rmse_px, 2)} pixel`} <small>{term} (radial RMSE)</small></p>
					<p class="small secondary">{unit === 'm' ? `${formatNumber(g.radial_rmse_px, 2)} pixel` : `${formatNumber(metres)} m`} on a native {g.pixel_size_m} m grid · {g.comparison.toLowerCase()}</p>
					<GeoChart {report} {unit} />
					<details class="cq-data">
						<summary>Data table</summary>
						<table class="cq-table">
							<thead><tr><th scope="col">{g.kind === 'absolute' ? 'Reflector' : 'Comparison'}</th><th scope="col">Radial error (pixel)</th><th scope="col">Radial error (m)</th></tr></thead>
							<tbody>{#each g.comparisons_px as value, i (i)}<tr><td>{i + 1}</td><td>{value.toFixed(2)}</td><td>{(value * g.pixel_size_m).toFixed(1)}</td></tr>{/each}</tbody>
						</table>
					</details>
					<ul class="cq-results">
						<li><span class="cq-k">Measured value</span>{measuredLine()}</li>
						<li><span class="cq-k">PFS requirement</span><span>{geocorrName}: <StatusText status={g.requirement_result} />{#if g.requirement_reason}&nbsp;— {g.requirement_reason}{/if}</span></li>
						<li><span class="cq-k">Sample</span>{g.matches_accepted} of {g.matches_total} {g.match_unit} used</li>
					</ul>
				</div>
				{#if rad && channel}
					<div class="panel-subtle cq-card">
						<div class="spread">
							<p class="label">Radiometric accuracy</p>
							<div class="segmented cq-mini" role="radiogroup" aria-label="Uncertainty coverage factor">
								<label><input type="radio" name="cq-k" value="1" checked={k === 1} onchange={() => (k = 1)} /><span>k = 1</span></label>
								<label><input type="radio" name="cq-k" value="2" checked={k === 2} onchange={() => (k = 2)} /><span>k = 2</span></label>
							</div>
						</div>
						<p class="cq-big">{radValue(rad, channel.difference)} <small>{rad.short_quantity} difference, {channelLabel(channel)}</small></p>
						<p class="small secondary">{rad.comparison} · uncertainty {radUncertainty(rad, channel.uncertainty_k1 * k)} (k = {k}){#if percent !== null} · {pct(percent)} of the reference value{/if}</p>
						<RadChart {rad} {k} />
						<details class="cq-data">
							<summary>Data table</summary>
							<table class="cq-table">
								<thead><tr><th scope="col">Channel</th><th scope="col">Difference</th><th scope="col">Uncertainty (k = 1)</th><th scope="col">Uncertainty (k = 2)</th>{#if rad.channels.some((c) => c.reference_value !== null)}<th scope="col">Of reference</th>{/if}</tr></thead>
								<tbody>
									{#each rad.channels as row (row.channel)}
										{@const rp = relativePercent(row)}
										<tr><td>{channelLabel(row)}</td><td>{radValue(rad, row.difference)}</td><td>{radUncertainty(rad, row.uncertainty_k1)}</td><td>{radUncertainty(rad, row.uncertainty_k1 * 2)}</td>{#if rad.channels.some((c) => c.reference_value !== null)}<td>{rp === null ? '—' : pct(rp)}</td>{/if}</tr>
									{/each}
								</tbody>
							</table>
						</details>
						<ul class="cq-results">
							<li><span class="cq-k">Accuracy test</span><span><StatusText status={rad.accuracy_test} />{#if rad.limit !== null}&nbsp;against ±{rad.limit}{rad.units === '1' ? '' : ` ${rad.units}`} ({rad.limit_source}){/if}{#if rad.accuracy_reason}&nbsp;— {rad.accuracy_reason}{/if}</span></li>
							<li><span class="cq-k">Sample</span>{rad.samples_used} of {rad.samples_total} {rad.sample_unit} used{#if rad.unique_exclusions}; {rad.unique_exclusions} excluded ({exclusionExamples(report.domain)}){/if}</li>
							<li><span class="cq-k">Units</span>{unitsDescription(rad.units, rad.quantity)}</li>
						</ul>
					</div>
				{:else}
					<div class="panel-subtle cq-card">
						<p class="label">Radiometric accuracy</p>
						<p class="cq-big"><small>No test defined yet</small></p>
						<p class="small">{report.radiometric_note}</p>
					</div>
				{/if}
			</div>

			{#if series && siteStats}
				<h3>Across scenes</h3>
				<div class="panel-subtle cq-card">
					<div class="spread">
						<p class="label">{series.description}</p>
						{#if series.sites.length > 1}
							<div class="segmented cq-mini" role="radiogroup" aria-label="Site">
								<label><input type="radio" name="cq-site" value="" checked={seriesSite === null} onchange={() => (seriesSite = null)} /><span>All sites</span></label>
								{#each series.sites as s (s.code)}
									<label><input type="radio" name="cq-site" value={s.code} checked={seriesSite === s.code} onchange={() => (seriesSite = s.code)} /><span>{s.code}</span></label>
								{/each}
							</div>
						{/if}
					</div>
					<dl class="facts cq-stats">
						<div class="fact"><dt>Scenes</dt><dd>{siteStats.scenes}</dd></div>
						<div class="fact"><dt>Period</dt><dd>{siteStats.start} to {siteStats.end}</dd></div>
						<div class="fact"><dt>Mean</dt><dd>{seriesValue(series, siteStats.mean)}</dd></div>
						<div class="fact"><dt>Spread (1 SD)</dt><dd>{seriesUncertainty(series, siteStats.sd)}</dd></div>
						{#if series.test === 'radiometric'}<div class="fact"><dt>Within k = 2 of zero</dt><dd>{siteStats.withinK2} of {siteStats.scenes}</dd></div>{/if}
					</dl>
					<SeriesChart {series} site={seriesSite} />
					{#if series.note}<p class="hint">{series.note}</p>{/if}
					<details class="cq-data">
						<summary>Data table</summary>
						<div class="cq-table-wrap">
							<table class="cq-table">
								<thead><tr><th scope="col">Date</th><th scope="col">Site</th><th scope="col">Value</th><th scope="col">Uncertainty (k = 1)</th></tr></thead>
								<tbody>
									{#each series.points.filter((p) => !seriesSite || p.site === seriesSite) as point, i (i)}
										<tr><td>{point.date}</td><td>{series.sites.find((s) => s.code === point.site)?.name ?? point.site}</td><td>{seriesValue(series, point.value)}</td><td>{seriesUncertainty(series, point.uncertainty_k1)}</td></tr>
									{/each}
								</tbody>
							</table>
						</div>
					</details>
				</div>
			{/if}

			<details class="cq-data cq-method" open>
				<summary>Method, reference and decision</summary>
				<div class="cq-table-wrap">
					<table class="cq-table">
						<thead><tr><th scope="col" style:width="18%">Evidence</th><th scope="col">Geometric: {g.label}</th><th scope="col">Radiometric{rad ? `: ${rad.label}` : ''}</th></tr></thead>
						<tbody>
							<tr><th scope="row">Method</th><td>{g.method}</td><td>{rad?.method ?? '—'}</td></tr>
							<tr><th scope="row">Reference</th><td>{g.reference}</td><td>{rad?.reference ?? '—'}</td></tr>
							<tr><th scope="row">Comparison</th><td>{g.comparison} ({g.kind})</td><td>{rad?.comparison ?? '—'}</td></tr>
							<tr><th scope="row">Notes</th><td>{g.method_notes ?? '—'}</td><td>{rad?.method_notes ?? report.radiometric_note ?? '—'}</td></tr>
							<tr><th scope="row">Sample</th><td>{g.matches_accepted} of {g.matches_total} {g.match_unit}</td><td>{rad ? `${rad.samples_used} of ${rad.samples_total} ${rad.sample_unit}` : '—'}</td></tr>
							<tr><th scope="row">Uncertainty</th><td>Positional uncertainty {g.positional_uncertainty ?? 'not estimated'}</td><td>{rad && channel ? `Comparison ${radUncertainty(rad, channel.uncertainty_k1)} (${channel.channel}, k = 1); product estimate ${rad.product_uncertainty ?? 'missing'}` : '—'}</td></tr>
							<tr><th scope="row">Limit</th><td>{g.limit_px !== null ? `≤ ${g.limit_px} pixel (${g.limit_source})` : 'None agreed'}</td><td>{rad ? (rad.limit !== null ? `±${rad.limit}${rad.units === '1' ? '' : ` ${rad.units}`} (${rad.limit_source})` : 'None agreed') : '—'}</td></tr>
							<tr>
								<th scope="row">Decision</th>
								<td>Numeric test <StatusText status={g.numeric_test} />; requirement <StatusText status={g.requirement_result} />{g.requirement_reason ? ` — ${g.requirement_reason}` : ''}</td>
								<td>{#if rad}Accuracy test <StatusText status={rad.accuracy_test} />; uncertainty Goal <StatusText status={rad.uncertainty_goal} />{rad.uncertainty_goal_reason ? ` — ${rad.uncertainty_goal_reason}` : ''}{:else}—{/if}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</details>
			{#if report.next_actions.length}
				<div class="notice cq-provider"><strong>For the data provider</strong><ul class="cq-actions">{#each report.next_actions as action (action)}<li>{action}</li>{/each}</ul></div>
			{/if}
			<details class="cq-data cq-provenance">
				<summary>Provenance: run code {report.run.code}</summary>
				<div class="stack-tight">
					<RunCode {report} />
					{#if report.run.note}<p class="hint">{report.run.note} Hover over or focus a part of the code to find it in the legend.</p>{/if}
					<p class="hint mono">Report {report.report_id} · {report.report_date} · Snapshot {report.run.snapshot} · Reviewer {report.run.reviewer ?? 'unassigned'}</p>
				</div>
			</details>
		</div>
	{/if}

	<p class="hint">{report.scope_note}</p>
</section>

<style>
	.cqas {
		scroll-margin-top: calc(var(--nav-height) + 12px);
		border-color: var(--line-strong);
		box-shadow: 0 0 0 3px var(--accent-soft);
	}
	.cqas:target {
		animation: cq-flash 1.4s ease;
	}
	@keyframes cq-flash {
		0%,
		40% {
			box-shadow: 0 0 0 6px var(--accent);
		}
		100% {
			box-shadow: 0 0 0 3px var(--accent-soft);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.cqas:target {
			animation: none;
		}
	}
	.cq-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: flex-end;
		gap: var(--space-1);
	}
	.cq-top {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
		gap: var(--space-2);
		align-items: stretch;
	}
	.cq-scope {
		color: var(--text);
		font-weight: 500;
	}
	.cq-strip {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(28px, 1fr));
		gap: 2px;
		max-width: 520px;
		margin: 4px 0 0;
		padding: 0;
		list-style: none;
	}
	.cq-strip button {
		width: 100%;
		height: 34px;
		border: 0;
		border-radius: 4px;
		cursor: pointer;
		font-weight: 700;
		font-size: 14px;
		display: grid;
		place-items: center;
	}
	.cq-strip .met,
	.sw.met {
		background: var(--ok-fg);
		color: var(--ok-bg);
	}
	.cq-strip .notmet,
	.sw.notmet {
		background: var(--danger-fg);
		color: var(--danger-bg);
	}
	.cq-strip .na,
	.cq-strip .nr,
	.sw.na,
	.sw.nr {
		background: var(--neutral-bg);
		color: var(--neutral-fg);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.cq-strip button:hover,
	.cq-strip button:focus-visible,
	.cq-strip button[aria-pressed='true'] {
		outline: 2px solid var(--text);
		outline-offset: 1px;
	}
	.cq-strip-detail {
		min-height: 2.8em;
	}
	.cq-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		font-size: 0.82rem;
		color: var(--text-secondary);
	}
	.sw {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 2px;
		margin-right: 6px;
	}
	.cq-grid2 {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
		gap: var(--space-2);
	}
	.cq-card {
		display: grid;
		gap: 8px;
		align-content: start;
		min-width: 0;
	}
	.cq-full {
		grid-column: 1 / -1;
	}
	.cq-wrap {
		overflow-wrap: anywhere;
	}
	.cq-counts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
		gap: var(--space-1);
	}
	.cq-counts .row {
		gap: 4px 16px;
		font-size: 0.92rem;
	}
	.cq-counts b {
		font-size: 1.25rem;
		margin-right: 4px;
	}
	.cq-tools {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.cq-reason {
		display: block;
		font-size: 0.8rem;
		font-weight: 400;
		color: var(--text-secondary);
	}
	.cq-results {
		display: grid;
		gap: 4px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 0.9rem;
	}
	.cq-results li {
		display: grid;
		grid-template-columns: 9.5em minmax(0, 1fr);
		gap: 8px;
	}
	.cq-k {
		color: var(--text-secondary);
		font-size: 0.82rem;
	}
	.cq-provider {
		align-content: start;
	}
	.cq-actions {
		margin: 0;
		padding-left: 18px;
	}
	.cq-method summary,
	.cq-provenance summary {
		font-size: 0.95rem;
	}
	@media (max-width: 767px) {
		.cq-top {
			grid-template-columns: 1fr;
		}
		.cq-results li {
			grid-template-columns: 1fr;
			gap: 0;
		}
	}
</style>
