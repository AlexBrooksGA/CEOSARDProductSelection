<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import AgencyMark from '$lib/components/AgencyMark.svelte';
	import AssessmentBadge from '$lib/components/AssessmentBadge.svelte';
	import Disclosure from '$lib/components/Disclosure.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import FactList from '$lib/components/FactList.svelte';
	import FamilyMark from '$lib/components/FamilyMark.svelte';
	import {
		accessAction,
		coverageFact,
		evidenceKindLabel,
		instrumentResolutionFact,
		isMimRecord,
		listFact,
		localAvailabilityFact,
		missingState,
		observationPeriodFact,
		outputEncodingFact,
		productLinks,
		qualityEvidence,
		qualitySummary,
		radiometricBitDepthFact,
		revisitFact,
		sourceLabel,
		spatialFact,
		textFact,
		updateFrequencyFact
	} from '$lib/domain/facts';
	import { familyLabel, FAMILY_BY_VALUE, CEOS_ARD_URL } from '$lib/domain/guidance';
	import { PROVENANCE_FIELD_ALIASES } from '$lib/domain/provenance';
	import { app } from '$lib/state/app.svelte';

	let { data } = $props();
	const store = app();
	let product = $derived(store.productsById[data.id] ?? data.mimProduct ?? null);
	let prov = $derived(data.provenance ?? store.provenanceFor(data.id));
	let presented = $derived(product ? store.presentProduct(product) : null);
	let outside = $derived(product ? store.outsideReasons(product) : null);
	let shortlisted = $derived(store.explorer.shortlist.includes(data.id));
	let compared = $derived(store.explorer.compare.includes(data.id));
	let access = $derived(product ? accessAction(product) : null);
	let links = $derived(product ? productLinks(product) : []);
	let cameFromResults = $state(false);
	afterNavigate(({ from }) => {
		cameFromResults = from?.url.pathname === '/';
	});

	let checkedDates = $derived([...new Set(Object.values(prov ?? {}).map((row) => row.date_checked))].sort());
	const EVIDENCE_FIELDS: [string, string][] = [
		['ceos_ard_status', 'Assessment status'],
		['pfs_version', 'PFS version'],
		['approval_date', 'Approval date'],
		['ard_tier', 'Assessment level'],
		['spatial_resolution_m', 'Spatial resolution'],
		['nominal_revisit_days', 'Nominal revisit'],
		['product_update_frequency_display', 'Product update frequency'],
		['geographic_coverage', 'Reported coverage'],
		['geometric_accuracy_display', 'Geometric accuracy'],
		['radiometric_accuracy_display', 'Radiometric accuracy'],
		['output_storage_bit_depth', 'Output storage'],
		['data_format', 'Data format'],
		['access_url', 'Access link']
	];
	function back(event: MouseEvent) {
		if (cameFromResults) {
			event.preventDefault();
			history.back();
		}
	}
</script>

<svelte:head>
	<title>{product ? product.product_name : 'Product not available'} · CEOS-ARD Product Explorer</title>
</svelte:head>

<div class="frame page">
	<p><a href={store.href('/')} onclick={back}>← Back to results</a></p>

	{#if !product}
		<div class="panel stack">
			<h1>Record not available</h1>
			<p class="mono small">{data.id}</p>
			<p>{data.valid ? store.unresolvedReason(data.id) : 'This is not a valid product identifier.'}</p>
			{#if data.id.startsWith('mim-product:') && store.mimStatus.configured && !store.mimLoaded}
				<button type="button" class="button primary" disabled={store.mimBusy} onclick={() => store.mimRequest('load')}>Load MIM products</button>
			{/if}
			{#if shortlisted}
				<p class="small secondary">It stays on your shortlist with any notes until you remove it.</p>
				<button type="button" class="button" onclick={() => store.toggleShortlist(data.id)}>Remove from shortlist</button>
			{/if}
		</div>
	{:else}
		<header class="detail-head panel">
			<div class="spread">
				<FamilyMark family={product.product_family} />
				<AgencyMark {product} />
			</div>
			<h1>{product.product_name}</h1>
			{#if product.official_product_name && product.official_product_name !== product.product_name}<p class="secondary">Official name: {product.official_product_name}</p>{/if}
			<p class="secondary">
				{product.provider ?? 'Provider not reported'} · {familyLabel(product.product_family)}
				{#if FAMILY_BY_VALUE[product.product_family ?? '']}<span class="small"> — {FAMILY_BY_VALUE[product.product_family ?? '']!.explanation}</span>{/if}
			</p>
			<div class="row"><AssessmentBadge {product} />{#if isMimRecord(product)}<span class="badge info">MIM record</span>{/if}</div>
			{#if outside}
				<p class="notice warn">Outside current results: {outside.map((reason) => reason.reason).join(' ')}</p>
			{/if}
			<div class="row actions">
				<button type="button" class="button" aria-pressed={shortlisted} onclick={() => store.toggleShortlist(product.id)}>{shortlisted ? '✓ On shortlist — remove' : 'Add to shortlist'}</button>
				<button type="button" class="button" aria-pressed={compared} onclick={() => store.toggleCompare(product.id)}>{compared ? '✓ In comparison — remove column' : 'Compare'}</button>
				{#if access?.url}<ExternalLink href={access.url} class="button primary">{access.label}</ExternalLink>{/if}
			</div>
			{#if access?.fallback}<p class="hint">{access.explanation}</p>{/if}
			<p class="hint">Provider portals perform the next area, period and access checks. This explorer does not download or validate imagery.</p>
		</header>

		<section class="panel stack" aria-labelledby="facts-heading">
			<h2 id="facts-heading">Spatial and temporal characteristics</h2>
			<FactList facts={[spatialFact(product, prov), revisitFact(product, prov), updateFrequencyFact(product, prov), observationPeriodFact(), coverageFact(product, prov), localAvailabilityFact()]} />
			<p class="hint">Temporal concepts are reported separately. Nominal revisit is an observation opportunity; it does not establish continuity, delivery frequency or local availability.</p>
		</section>

		<div class="concepts">
			<section class="panel stack" aria-labelledby="assessment-heading">
				<h2 id="assessment-heading">CEOS-ARD assessment</h2>
				<p class="hint">Conformance with a named Product Family Specification (PFS). The PFS version is not the product's processing version. Threshold and Goal are PFS terms, not your Required/Preferred settings.</p>
				<FactList
					facts={[
						{ label: 'Status', value: product.ceos_ard_status },
						textFact(product, 'PFS and version', 'ceos_ard_pfs', prov),
						textFact(product, isMimRecord(product) ? 'MIM product status' : 'Assessment level', 'ceos_ard_assessment_level', prov),
						textFact(product, 'Approval date', 'approval_date', prov),
						{ label: 'Assessed identity', value: product.ceos_ard_assessment_id ?? product.official_product_name ?? product.product_name },
						{ label: 'Product processing version', value: null, missing: { kind: 'not-established', text: 'Not established in this catalogue' } }
					]}
				/>
				<p class="small">
					Evidence:
					{#if product.self_assessment_url || product.peer_review_url}
						{#if product.self_assessment_url}<ExternalLink href={product.self_assessment_url}>Self-assessment</ExternalLink>{/if}
						{#if product.self_assessment_url && product.peer_review_url} · {/if}
						{#if product.peer_review_url}<ExternalLink href={product.peer_review_url}>CEOS peer-review outcome</ExternalLink>{/if}
					{:else}<span class="missing">No assessment documents linked</span>{/if}
				</p>
				<Disclosure key="detail:qualifications" label="Scope and qualifications">
					<p>{product.ard_tier_notes ?? missingState(product, 'ard_tier_notes', prov).text}</p>
					{#if product.notes}<p class="small secondary">{product.notes}</p>{/if}
					<p class="hint">An old approval date alone does not mean the assessment has expired; superseded information is shown only when a source confirms it. <ExternalLink href={CEOS_ARD_URL}>CEOS-ARD register</ExternalLink></p>
				</Disclosure>
			</section>

			<section class="panel stack" aria-labelledby="quality-heading">
				<h2 id="quality-heading">Measured quality evidence</h2>
				<p><strong>{qualitySummary(product)}</strong></p>
				<p class="hint">Absent evidence does not mean poor quality. Provider-reported values are not assumed to be independent validation, and different metrics are not directly comparable.</p>
				<Disclosure key="detail:quality" label="Geometric and radiometric evidence" defaultOpen>
					{#each [qualityEvidence(product, 'geometric', prov), qualityEvidence(product, 'radiometric', prov)] as evidence (evidence.kind)}
						<div class="evidence">
							<h3>{evidence.label}</h3>
							{#if evidence.reported}
								<p>{evidence.display}</p>
								<dl class="facts">
									<div class="fact"><dt>Metric</dt><dd>{evidence.metric ?? 'Not stated'}</dd></div>
									<div class="fact"><dt>Value and unit</dt><dd>{evidence.value ?? '—'} {evidence.unit ?? ''}</dd></div>
									<div class="fact"><dt>Source kind</dt><dd>{evidence.sourceKind ?? 'Not established'}</dd></div>
									<div class="fact"><dt>Scope, method, date</dt><dd class="missing">Not established in this catalogue</dd></div>
								</dl>
								{#if evidence.sourceUrl}<p class="small"><ExternalLink href={evidence.sourceUrl}>{evidence.sourceTitle ?? 'Source'}</ExternalLink>{#if evidence.dateChecked} · catalogue checked {evidence.dateChecked}{/if}</p>{/if}
							{:else}
								<p class="missing">{evidence.missing?.text}</p>
							{/if}
						</div>
					{/each}
				</Disclosure>
			</section>

			<section class="panel stack" aria-labelledby="requirements-heading">
				<h2 id="requirements-heading">My requirements and open checks</h2>
				{#if presented && presented.reasons.length}
					<ul class="reasons">
						{#each presented.reasons as reason (reason.name)}
							<li><span class="state {reason.state}">{reason.state === 'met' ? '✓ Meets' : reason.state === 'outside' ? '△ Outside' : '? Needs evidence'}</span> — {reason.text}</li>
						{/each}
					</ul>
				{:else}
					<p class="secondary">No screening criteria are active. <a href={store.href('/')}>Set criteria in Discover</a>.</p>
				{/if}
				<p><strong>Still to check</strong></p>
				<ul class="small">
					<li>Observations for your area and period — not checked here; use the provider access portal.</li>
					<li>Task-specific geometric and radiometric accuracy and suitability for your application.</li>
					{#if presented}{#each presented.requiredUnknown as reason (reason.name)}<li>{reason.label}: not reported — check the provider documentation.</li>{/each}{/if}
				</ul>
				<p class="hint">Meeting your criteria, or holding a CEOS-ARD assessment, does not establish suitability for your application.</p>
			</section>
		</div>

		<section class="panel stack" aria-labelledby="links-heading">
			<h2 id="links-heading">Access, documentation and samples</h2>
			{#if links.length}
				<ul class="links">{#each links as link (link.kind)}<li><ExternalLink href={link.url}>{link.label}</ExternalLink></li>{/each}</ul>
			{/if}
			{#if !product.access_url}<p class="missing">No sourced access link is recorded.{#if access?.url} Use the documentation to find access routes.{/if}</p>{/if}
		</section>

		<section class="panel stack" aria-labelledby="technical-heading">
			<h2 id="technical-heading">Technical details</h2>
			<Disclosure key="detail:technical" label="Processing and encoding">
				<FactList
					facts={[
						textFact(product, 'Atmospheric or radiometric correction', 'atmospheric_correction', prov),
						textFact(product, 'Elevation model', 'elevation_model', prov),
						textFact(product, 'Coordinate reference system', 'coordinate_system', prov),
						textFact(product, 'Data format', 'data_format', prov),
						outputEncodingFact(product, prov),
						radiometricBitDepthFact(product, prov),
						textFact(product, 'Swath width', 'swath_width', prov),
						textFact(product, 'Operational status', 'operational_status', prov)
					]}
				/>
				<p class="hint">Output storage describes file encoding, not radiometric resolution or quality.</p>
			</Disclosure>
			<Disclosure key="detail:instrument" label="Missions and instruments">
				<FactList facts={[listFact(product, 'Missions', 'missions'), listFact(product, 'Instruments', 'instruments'), textFact(product, 'Sensor or instrument type', 'sensor_or_instrument_type', prov), instrumentResolutionFact(product)]} />
				<p class="hint">Instrument values describe the sensor and can differ from the delivered product's grid or mode-specific resolution. They are never used for product matching.</p>
			</Disclosure>
			<Disclosure key="detail:provenance" label="Provenance">
				<FactList
					facts={[
						{ label: 'Record source', value: sourceLabel(product.source_type) },
						{ label: 'Catalogue sources last checked', value: checkedDates.length ? checkedDates.join(', ') : null, missing: { kind: 'not-established', text: isMimRecord(product) ? 'Retrieved from MIM; see the MIM status for load time' : 'No research-log dates' }, note: 'Checking dates are not observation or measurement dates.' },
						{ label: 'Stable identifier', value: product.id }
					]}
				/>
				{#if product.source_url}<p class="small"><ExternalLink href={product.source_url}>Source record</ExternalLink></p>{/if}
				{#if prov}
					<table class="evidence-table">
						<caption>Field-level research log (selected fields)</caption>
						<thead><tr><th scope="col">Field</th><th scope="col">Evidence</th><th scope="col">Confidence</th><th scope="col">Checked</th></tr></thead>
						<tbody>
							{#each EVIDENCE_FIELDS as [field, label] (field)}
								{@const row = prov[PROVENANCE_FIELD_ALIASES[field] ?? field]}
								{#if row}
									<tr>
										<th scope="row">{label}</th>
										<td>{#if row.source_url}<ExternalLink href={row.source_url}>{row.source_title}</ExternalLink>{:else}{row.source_title}{/if}<span class="small secondary"> · {evidenceKindLabel(row.evidence_level)}</span></td>
										<td>{row.confidence.replaceAll('_', ' ')}</td>
										<td class="mono">{row.date_checked}</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
				{/if}
			</Disclosure>
		</section>
	{/if}
</div>

<style>
	.detail-head {
		display: grid;
		gap: 10px;
	}
	.concepts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
		gap: var(--space-2);
		align-items: start;
	}
	.evidence + .evidence {
		margin-top: var(--space-2);
	}
	.evidence h3 {
		font-size: 0.95rem;
		margin-bottom: 4px;
	}
	.reasons,
	.links {
		display: grid;
		gap: 6px;
		margin: 0;
		padding-left: 18px;
	}
	ul.small {
		margin: 0;
		padding-left: 18px;
	}
	.evidence-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
		margin-top: var(--space-1);
	}
	.evidence-table caption {
		text-align: left;
		font-weight: 600;
		padding-bottom: 6px;
	}
	.evidence-table th,
	.evidence-table td {
		padding: 6px 8px;
		border-bottom: 1px solid var(--line);
		text-align: left;
		vertical-align: top;
	}
	@media (max-width: 767px) {
		.evidence-table {
			display: block;
			overflow-x: auto;
		}
	}
</style>
