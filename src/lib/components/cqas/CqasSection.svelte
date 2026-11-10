<script lang="ts">
	import './cqas.css';
	import {
		dataStatusLabel,
		findingCounts,
		FINDING_STATUSES,
		formatNumber,
		geometricMetres,
		headlineBand,
		pfsVersionDiffers,
		signed,
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
	import StatusText from './StatusText.svelte';
	import { STATUS_META } from './chart';

	let { report, product }: { report: CqasReport; product: Product } = $props();
	const store = app();

	let mode = $derived(store.explorer.cqasDetail);
	let threshold = $derived(findingCounts(report, 'threshold'));
	let goal = $derived(findingCounts(report, 'goal'));
	let g = $derived(report.geometric);
	let rad = $derived(report.radiometric);
	let band = $derived(headlineBand(report));
	let metres = $derived(geometricMetres(report));
	let versionDiffers = $derived(pfsVersionDiffers(report, product.pfs_version));
	let filter = $state<'all' | FindingStatus>('all');
	let unit = $state<'px' | 'm'>('px');
	let k = $state<1 | 2>(1);
	let rows = $derived(report.findings.filter((row) => filter === 'all' || row.threshold === filter || row.goal === filter));
	let stripOrder = $derived(
		[...report.findings].sort((a, b) => FINDING_STATUSES.indexOf(a.threshold) - FINDING_STATUSES.indexOf(b.threshold) || 0)
	);
	let bandName = $derived(rad.headline_band_name ? `${rad.headline_band_name[0]!.toUpperCase()}${rad.headline_band_name.slice(1)}-band` : band.band);
	let stripTip = $state<string | null>(null);

	/** Switch level; when the control that was used disappears, move focus to the section. */
	function setMode(next: 'simple' | 'advanced', moveFocus = false) {
		void store.patch((draft) => void (draft.cqasDetail = next), 'replace').then(() => {
			if (!moveFocus) return;
			const section = document.getElementById('cqas');
			section?.scrollIntoView({ block: 'start' });
			section?.focus({ preventScroll: true });
		});
	}
	let measurement = $derived(report.pfs.name.toLowerCase());
	let assessedVersion = $derived(product.pfs_version ? `v${product.pfs_version.trim().replace(/^v/i, '')}` : null);
	function thresholdLabel(status: FindingStatus): string {
		return status === 'Not required' ? 'Not required at Threshold' : status;
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
	<div class="row">
		<span class="badge {report.data_status === 'reviewed' ? 'assessed' : 'progress'}"><span aria-hidden="true">◔</span>{dataStatusLabel(report.data_status)}</span>
		<span class="badge neutral" title="Product Family Specification">PFS {report.pfs.name} v{report.pfs.version}</span>
		<span class="badge neutral mono">{report.report_id}</span>
	</div>
	<p class="hint">
		{report.status_note}
		One {report.scene.platform} {report.scene.instrument} scene.
		{#if versionDiffers}C-QAS checks use {report.pfs.short_name} PFS v{report.pfs.version}; this product's CEOS-ARD assessment used {assessedVersion}.{/if}
	</p>

	{#if mode === 'simple'}
		<div class="stack" data-mode="simple">
			<div class="cq-top">
				<div class="panel-subtle stack-tight">
					<p class="label">Standard PFS checks · selected Threshold rows</p>
					<p class="cq-big">{threshold.Met} Met <small>/</small> {threshold['Not met']} Not met</p>
					<p class="small secondary">
						{report.findings_summary}
						{#if threshold['Not required']}No Threshold requirement for {threshold['Not required']} additional row{threshold['Not required'] === 1 ? '' : 's'}.{/if}
					</p>
					<ul class="cq-strip" aria-label="Threshold findings for {report.findings.length} selected PFS requirements">
						{#each stripOrder as row (row.id)}
							{@const meta = STATUS_META[row.threshold]}
							<li>
								<button
									type="button"
									class={meta.cls}
									aria-label="{row.requirement}: Threshold {thresholdLabel(row.threshold)}, Goal {row.goal}. Show all findings."
									onmouseenter={() => (stripTip = row.id)}
									onmouseleave={() => (stripTip = null)}
									onfocus={() => (stripTip = row.id)}
									onblur={() => (stripTip = null)}
									onclick={() => setMode('advanced', true)}><span aria-hidden="true">{meta.icon}</span></button
								>
							</li>
						{/each}
					</ul>
					{#if stripTip}
						{@const row = report.findings.find((item) => item.id === stripTip)}
						{#if row}<p class="small cq-strip-detail" aria-hidden="true"><strong>{row.requirement}</strong> <span class="mono secondary">{row.id}</span> · Threshold: {thresholdLabel(row.threshold)} · Goal: {row.goal}</p>{/if}
					{/if}
					<div class="cq-legend">
						{#each FINDING_STATUSES.filter((status) => threshold[status]) as status (status)}
							<span><i class="sw {STATUS_META[status].cls}"></i>{STATUS_META[status].icon} {thresholdLabel(status)} ({threshold[status]})</span>
						{/each}
					</div>
				</div>
				<div class="notice warn">
					<strong>Next action</strong>
					<span>{report.next_action}</span>
					<span class="small">Counts refer to {report.findings.length} selected Threshold rows, not all {report.pfs.total_requirements} PFS requirements.</span>
				</div>
			</div>

			<div class="cq-grid2">
				<div class="panel-subtle cq-card">
					<p class="label">Where are the pixels?</p>
					<p class="cq-big">{formatNumber(metres)} m <small>relative error</small></p>
					<GeoGauge {report} />
					<p class="small">
						The numeric limit test ({g.comparison.toLowerCase()}) is {g.numeric_test}.
						{#if g.requirement_result !== g.numeric_test}The full PFS requirement is {g.requirement_result}{#if g.requirement_reason}: {g.requirement_reason}{/if}.{/if}
					</p>
					<p class="hint">Accuracy against an independent ground reference: {g.absolute_accuracy}.</p>
				</div>
				<div class="panel-subtle cq-card">
					<p class="label">How close are the {measurement} values?</p>
					<p class="cq-big">{Math.abs(band.difference).toFixed(3)} <small>difference, {rad.headline_band_name ?? band.band} band</small></p>
					<RadNumberLine {report} />
					<p class="small">{bandName} {measurement} differs from the {report.data_status === 'example' ? 'example ' : ''}reference ({rad.reference}) by {Math.abs(band.difference).toFixed(3)}; comparison uncertainty is ±{band.uncertainty_k1.toFixed(3)}.</p>
					<p class="hint">Accuracy test: {rad.accuracy_test}{#if rad.accuracy_reason}&nbsp;— {rad.accuracy_reason}{/if}.</p>
				</div>
			</div>
			<p><button type="button" class="button plain" onclick={() => setMode('advanced', true)}>Show findings, plots and evidence →</button></p>
		</div>
	{:else}
		<div class="stack" data-mode="advanced">
			<h3>Input scene and processing</h3>
			<div class="cq-grid2">
				<div class="panel-subtle cq-card">
					<p class="label">Input scene details</p>
					<dl class="facts">
						<div class="fact cq-full"><dt>Scene ID</dt><dd class="mono cq-wrap">{report.scene.product_id}</dd></div>
						<div class="fact"><dt>Acquisition date</dt><dd>{report.scene.acquisition_date}</dd></div>
						{#if report.scene.path !== null && report.scene.row !== null}<div class="fact"><dt>Path / Row</dt><dd>{report.scene.path} / {report.scene.row}</dd></div>{/if}
						{#if report.scene.reference_site}<div class="fact"><dt>{report.scene.reference_site.network} site coverage</dt><dd>{report.scene.reference_site.code}<span class="basis">{report.scene.reference_site.name}</span></dd></div>{/if}
					</dl>
					{#if report.scene.note}<p class="hint">{report.scene.note}</p>{/if}
				</div>
				<div class="panel-subtle cq-card">
					<p class="label">C-QAS run code</p>
					<RunCode {report} />
					{#if report.run.note}<p class="hint">{report.run.note} Hover or focus a part of the code to find it in the legend.</p>{/if}
				</div>
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
				<h3>PFS findings — selected requirements</h3>
				<div class="segmented cq-mini" role="radiogroup" aria-label="Show rows with">
					{#each ['all', ...FINDING_STATUSES] as const as value (value)}
						<label><input type="radio" name="cq-filter" {value} checked={filter === value} onchange={() => (filter = value)} /><span>{value === 'all' ? 'All' : value}</span></label>
					{/each}
				</div>
			</div>
			<div class="cq-table-wrap">
				<table class="cq-table cq-findings">
					<caption class="visually-hidden">PFS findings for the selected requirements</caption>
					<thead><tr><th scope="col" style:width="50%">PFS requirement</th><th scope="col">Threshold</th><th scope="col">Goal</th></tr></thead>
					<tbody>
						{#each rows as row (row.id)}
							<tr>
								<th scope="row">{row.requirement}<span class="cq-id">{row.id}</span>{#if row.reason}<span class="cq-reason">{row.reason}</span>{/if}</th>
								<td><StatusText status={row.threshold} /></td>
								<td><StatusText status={row.goal} /></td>
							</tr>
						{:else}
							<tr><td colspan="3" class="missing">No selected requirement has this finding.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="hint" aria-live="polite">
				{rows.length} of {report.pfs.total_requirements} requirements shown{filter === 'all' ? '' : ` (filtered from ${report.findings.length} selected)`}. Met / Not met are assessed outcomes; Not assessed means not tested; Not required means the PFS has no requirement at that level.
			</p>

			<h3>Accuracy testing</h3>
			<div class="cq-grid2">
				<div class="panel-subtle cq-card">
					<div class="spread">
						<p class="label">Geometric accuracy</p>
						<div class="segmented cq-mini" role="radiogroup" aria-label="Units">
							<label><input type="radio" name="cq-unit" value="px" checked={unit === 'px'} onchange={() => (unit = 'px')} /><span>pixel</span></label>
							<label><input type="radio" name="cq-unit" value="m" checked={unit === 'm'} onchange={() => (unit = 'm')} /><span>metres</span></label>
						</div>
					</div>
					<p class="cq-big">{formatNumber(g.radial_rmse_px, 2)} <small>pixel radial RMSE</small></p>
					<p class="small secondary">{formatNumber(metres)} m on a native {g.pixel_size_m} m grid · {g.comparison.toLowerCase()} comparison</p>
					<GeoChart {report} {unit} />
					<details class="cq-data">
						<summary>Data table</summary>
						<table class="cq-table">
							<thead><tr><th scope="col">Comparison</th><th scope="col">Radial error (pixel)</th><th scope="col">Radial error (m)</th></tr></thead>
							<tbody>{#each g.comparisons_px as value, i (i)}<tr><td>{i + 1}</td><td>{value.toFixed(2)}</td><td>{(value * g.pixel_size_m).toFixed(1)}</td></tr>{/each}</tbody>
						</table>
					</details>
					<p class="small">{g.matches_accepted} / {g.matches_total} matches accepted · Absolute accuracy: <StatusText status={g.absolute_accuracy} /></p>
					<p class="small"><StatusText status={g.requirement_result} prefix="PFS Threshold: " />{#if g.requirement_reason}&nbsp;— {g.requirement_reason}{/if}</p>
				</div>
				<div class="panel-subtle cq-card">
					<div class="spread">
						<p class="label">Radiometric accuracy</p>
						<div class="segmented cq-mini" role="radiogroup" aria-label="Uncertainty coverage factor">
							<label><input type="radio" name="cq-k" value="1" checked={k === 1} onchange={() => (k = 1)} /><span>k = 1</span></label>
							<label><input type="radio" name="cq-k" value="2" checked={k === 2} onchange={() => (k = 2)} /><span>k = 2</span></label>
						</div>
					</div>
					<p class="cq-big">{signed(band.difference)} <small>{report.pfs.short_name} difference, {band.band}</small></p>
					<p class="small secondary">{rad.comparison} · comparison uncertainty ±{band.uncertainty_k1.toFixed(3)} (k = 1)</p>
					<RadChart {report} {k} />
					<details class="cq-data">
						<summary>Data table</summary>
						<table class="cq-table">
							<thead><tr><th scope="col">Band</th><th scope="col">{report.pfs.short_name} difference</th><th scope="col">Uncertainty (k = 1)</th><th scope="col">Uncertainty (k = 2)</th></tr></thead>
							<tbody>{#each rad.bands as row (row.band)}<tr><td>{row.band}</td><td>{signed(row.difference)}</td><td>±{row.uncertainty_k1.toFixed(3)}</td><td>±{(row.uncertainty_k1 * 2).toFixed(3)}</td></tr>{/each}</tbody>
						</table>
					</details>
					<p class="small">{rad.pixels_used} / {rad.pixels_total} pixels used · {report.pfs.short_name} units: {rad.units} · Product uncertainty estimate: {rad.product_uncertainty ?? 'missing'}</p>
					<p class="small"><StatusText status={rad.accuracy_test} prefix="Accuracy test: " />{#if rad.accuracy_reason}&nbsp;— {rad.accuracy_reason}{/if}</p>
				</div>
			</div>

			<details class="cq-data cq-method" open>
				<summary>Method, reference and decision</summary>
				<div class="cq-table-wrap">
					<table class="cq-table">
						<thead><tr><th scope="col" style:width="18%">Evidence field</th><th scope="col">Geometric: {g.label}</th><th scope="col">Radiometric: {rad.label}</th></tr></thead>
						<tbody>
							<tr>
								<th scope="row">Method / reference</th>
								<td>{[g.method, g.reference, g.comparison.toLowerCase(), g.method_notes].filter(Boolean).join('; ')}</td>
								<td>{[rad.method, rad.reference, rad.method_notes].filter(Boolean).join('; ')}</td>
							</tr>
							<tr>
								<th scope="row">Sample / uncertainty</th>
								<td>{g.matches_accepted} / {g.matches_total} matches. Positional uncertainty {g.positional_uncertainty ?? 'not estimated'}.</td>
								<td>{rad.pixels_used} / {rad.pixels_total} pixels{rad.unique_exclusions !== null ? `; ${rad.unique_exclusions} unique exclusions` : ''}. Standard comparison uncertainty {band.uncertainty_k1.toFixed(3)} ({band.band}), k = 1.</td>
							</tr>
							<tr>
								<th scope="row">Limit / decision</th>
								<td>{g.limit_px !== null ? `≤${g.limit_px} pixel (${g.limit_source}). ` : 'No numeric limit. '}Numeric test {g.numeric_test}; full requirement {g.requirement_result}{g.requirement_reason ? `: ${g.requirement_reason}` : ''}.</td>
								<td>Accuracy test {rad.accuracy_test}{rad.accuracy_reason ? `: ${rad.accuracy_reason}` : ''}. Measurement Uncertainty Goal {rad.uncertainty_goal}{rad.uncertainty_goal_reason ? `: ${rad.uncertainty_goal_reason}` : ''}.</td>
							</tr>
						</tbody>
					</table>
				</div>
			</details>
			{#if report.next_actions.length}
				<div class="notice warn"><strong>Next actions</strong><ul class="cq-actions">{#each report.next_actions as action (action)}<li>{action}</li>{/each}</ul></div>
			{/if}
			<p class="hint mono">Run {report.run.code} · Snapshot {report.run.snapshot} · Reviewer {report.run.reviewer ?? 'unassigned'} · {report.pfs.short_name} units: {rad.units} · Absolute accuracy: {g.absolute_accuracy} · Report {report.report_date}</p>
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
	.cq-strip button:focus-visible {
		outline: 2px solid var(--text);
		outline-offset: 1px;
	}
	.cq-strip-detail {
		min-height: 1.4em;
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
	.cq-actions {
		margin: 0;
		padding-left: 18px;
	}
	.cq-method summary {
		font-size: 0.95rem;
	}
	@media (max-width: 767px) {
		.cq-top {
			grid-template-columns: 1fr;
		}
	}
</style>
