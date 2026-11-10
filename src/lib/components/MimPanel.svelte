<script lang="ts">
	import { ICON_CREDIT, missionEnded, type MimDetails, type MimMission, type MissionVisual } from '$lib/domain/mim';
	import Disclosure from './Disclosure.svelte';
	import ExternalLink from './ExternalLink.svelte';
	import MimMark from './MimMark.svelte';

	/** Missions and instruments from the CEOS MIM database. Every value here comes from MIM. */
	let { details, visuals = {} }: { details: MimDetails; visuals?: Record<string, MissionVisual> } = $props();

	const orbit = (m: MimMission) =>
		[m.orbit_type, m.orbit_altitude_km !== null ? `${m.orbit_altitude_km} km` : null, m.orbit_inclination_deg !== null ? `${m.orbit_inclination_deg}° inclination` : null, m.orbit_lst ? `${m.orbit_sense ? `${m.orbit_sense.toLowerCase()} ` : ''}local time ${m.orbit_lst}` : null]
			.filter(Boolean)
			.join(' · ') || null;
	const ended = (m: MimMission) => missionEnded(m);
	const num = (value: number | null, unit: string) => (value === null ? '—' : `${Number(value.toPrecision(6))} ${unit}`);
</script>

<section class="panel stack" aria-labelledby="mim-heading">
	<div class="spread">
		<h2 id="mim-heading">Missions and instruments<MimMark decorative /></h2>
		<span class="small secondary">CEOS MIM database</span>
	</div>
	<p class="mim-legend small"><span class="mim-mark" aria-hidden="true">*</span> Every value in this section is from the CEOS MIM database (see the source note at the end of the page).</p>
	<p class="hint">
		What the satellites and sensors are, as declared by CEOS agencies. These describe the missions and instruments, not the delivered product, and are never used for matching.
		{#if details.note}{details.note}{/if}
	</p>

	{#if details.constellations.length}
		<h3>Constellation{details.constellations.length > 1 ? 's' : ''}</h3>
		<div class="mim-grid">
			{#each details.constellations as constellation (constellation.constellation_id)}
				<article class="panel-subtle mim-card" aria-labelledby="mim-constellation-{constellation.constellation_id}">
					<h4 id="mim-constellation-{constellation.constellation_id}">{constellation.name_full ?? constellation.name_short}<MimMark decorative /></h4>
					<dl class="facts compact-facts">
						<div class="fact"><dt>Status</dt><dd>{constellation.status ?? '—'}</dd></div>
						<div class="fact"><dt>Satellites active</dt><dd>{constellation.active_unit_count ?? '—'}{#if constellation.target_unit_count !== null}<span class="basis">of {constellation.target_unit_count} planned</span>{/if}</dd></div>
						<div class="fact"><dt>First launch</dt><dd>{constellation.first_launch_date ?? '—'}</dd></div>
						<div class="fact"><dt>Latest launch</dt><dd>{constellation.latest_launch_date ?? '—'}</dd></div>
						<div class="fact"><dt>Operator</dt><dd>{constellation.operator ?? '—'}</dd></div>
						{#if constellation.orbit_description}<div class="fact wide"><dt>Orbit</dt><dd>{constellation.orbit_description}</dd></div>{/if}
					</dl>
				</article>
			{/each}
		</div>
	{/if}

	<h3>Missions ({details.missions.length})</h3>
	<div class="mim-grid">
		{#each details.missions as mission (mission.mission_id)}
			{@const visual = visuals[String(mission.mission_id)]}
			<article class="panel-subtle mim-card" aria-labelledby="mim-mission-{mission.mission_id}">
				{#if visual}
					<figure class="mim-figure">
						<img src={visual.image ?? visual.icon} alt="{mission.acronym ?? 'Satellite'} {visual.image ? 'spacecraft' : 'spacecraft silhouette'}" loading="lazy" decoding="async" class:silhouette={!visual.image} />
						<figcaption class="small secondary">
							{#if visual.image && visual.credit}
								{visual.credit.rights_holder}{#if visual.credit.license}, {#if visual.credit.license_url}<ExternalLink href={visual.credit.license_url}>{visual.credit.license}</ExternalLink>{:else}{visual.credit.license}{/if}{/if}{#if visual.credit.modified}&nbsp;(modified){/if}{#if visual.credit.source_url}&nbsp;· <ExternalLink href={visual.credit.source_url}>source</ExternalLink>{/if}
							{:else}
								{ICON_CREDIT}
							{/if}
						</figcaption>
					</figure>
				{/if}
				<h4 id="mim-mission-{mission.mission_id}">{mission.acronym ?? mission.full_name}<MimMark decorative /></h4>
				{#if mission.full_name && mission.full_name !== mission.acronym}<p class="small secondary">{mission.full_name}</p>{/if}
				{#if mission.description}<p class="small">{mission.description}</p>{/if}
				<dl class="facts compact-facts">
					<div class="fact"><dt>Status</dt><dd>{mission.status ?? '—'}</dd></div>
					<div class="fact"><dt>Launch</dt><dd>{mission.launch_date ?? '—'}</dd></div>
					<div class="fact"><dt>{ended(mission) ? 'End of life' : 'Planned end of life'}</dt><dd>{mission.eol_date ?? '—'}</dd></div>
					<div class="fact"><dt>Lead agency</dt><dd>{mission.lead_agency ?? '—'}</dd></div>
					<div class="fact"><dt>Repeat cycle</dt><dd>{mission.repeat_cycle_days !== null ? `${mission.repeat_cycle_days} days` : '—'}<span class="basis">Mission orbit repeat, not product revisit</span></dd></div>
					<div class="fact wide"><dt>Orbit</dt><dd>{orbit(mission) ?? '—'}</dd></div>
				</dl>
				{#if mission.eoportal_url || mission.mission_url}
					<p class="small">
						{#if mission.mission_url}<ExternalLink href={mission.mission_url}>Mission site</ExternalLink>{/if}
						{#if mission.mission_url && mission.eoportal_url} · {/if}
						{#if mission.eoportal_url}<ExternalLink href={mission.eoportal_url}>eoPortal</ExternalLink>{/if}
					</p>
				{/if}
			</article>
		{/each}
	</div>

	<h3>Instruments ({details.instruments.length})</h3>
	{#each details.instruments as instrument (instrument.instrument_id)}
		<Disclosure key="mim:instrument:{instrument.instrument_id}" label="{instrument.name_short ?? 'Instrument'}{instrument.name_full && instrument.name_full !== instrument.name_short ? ` — ${instrument.name_full}` : ''}" summary={[instrument.instrument_types, instrument.operator].filter(Boolean).join(' · ')}>
			<dl class="facts">
				<div class="fact"><dt>Type</dt><dd>{instrument.instrument_types ?? '—'}<MimMark decorative /></dd></div>
				<div class="fact"><dt>Operator</dt><dd>{instrument.operator ?? '—'}<MimMark decorative /></dd></div>
				<div class="fact"><dt>Status</dt><dd>{[instrument.status, instrument.maturity].filter(Boolean).join(' · ') || '—'}<MimMark decorative /></dd></div>
				<div class="fact"><dt>Spatial resolution<span class="display-only">instrument</span></dt><dd>{instrument.spatial_resolution_description ?? num(instrument.spatial_resolution_best_m, 'm')}<MimMark decorative /></dd></div>
				<div class="fact"><dt>Swath</dt><dd>{instrument.swath_width_description ?? num(instrument.swath_width_max_km, 'km')}<MimMark decorative /></dd></div>
				<div class="fact"><dt>Wavebands</dt><dd>{instrument.waveband_description ?? '—'}<MimMark decorative /></dd></div>
				{#if instrument.accuracy_description}<div class="fact wide"><dt>Accuracy (declared)</dt><dd>{instrument.accuracy_description}<MimMark decorative /><span class="basis">Agency-declared instrument accuracy; not independent validation of the product.</span></dd></div>{/if}
				{#if instrument.data_format_info}<div class="fact"><dt>Data formats</dt><dd>{instrument.data_format_info}<MimMark decorative /></dd></div>{/if}
				{#if instrument.measurements.length}<div class="fact wide"><dt>Measurements (declared)</dt><dd>{instrument.measurements.map((m) => m.name).join(' · ')}<MimMark decorative /></dd></div>{/if}
			</dl>
			{#if instrument.measurement_description}<p class="small secondary">{instrument.measurement_description}</p>{/if}
			{#if instrument.sar}
				{@const sar = instrument.sar}
				<h4 class="sar-heading">Radar parameters<MimMark decorative /></h4>
				<dl class="facts">
					<div class="fact"><dt>Band</dt><dd>{sar.band ?? '—'}{#if sar.centre_frequency_ghz !== null}<span class="basis">{sar.centre_frequency_ghz} GHz centre frequency</span>{/if}</dd></div>
					<div class="fact"><dt>Polarisations</dt><dd>{sar.polarisations.join(', ') || '—'}{#if sar.polarisation_modes.length}<span class="basis">{sar.polarisation_modes.join(', ')}</span>{/if}</dd></div>
					<div class="fact"><dt>Look direction</dt><dd>{sar.look_direction ?? '—'}</dd></div>
				</dl>
				{#if sar.imaging_modes.length}
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<div class="table-wrap" role="region" tabindex="0" aria-labelledby="modes-{instrument.instrument_id}">
						<table class="mim-table">
							<caption id="modes-{instrument.instrument_id}">Imaging modes ({sar.imaging_modes.length})<MimMark decorative /></caption>
							<thead><tr><th scope="col">Mode</th><th scope="col">Resolution (az × rg)</th><th scope="col">Swath</th><th scope="col">Incidence</th><th scope="col">NESZ</th></tr></thead>
							<tbody>
								{#each sar.imaging_modes as mode, i (i)}
									<tr>
										<th scope="row">{mode.name ?? '—'}{#if mode.code}<span class="mono small secondary mode-code">{mode.code}</span>{/if}</th>
										<td>{mode.azimuth_resolution_m !== null || mode.range_resolution_m !== null ? `${mode.azimuth_resolution_m ?? '?'} × ${mode.range_resolution_m ?? '?'} m` : '—'}</td>
										<td>{num(mode.swath_km, 'km')}</td>
										<td>{mode.incidence_min_deg !== null && mode.incidence_max_deg !== null ? `${mode.incidence_min_deg}–${mode.incidence_max_deg}°` : '—'}</td>
										<td>{num(mode.nesz_db, 'dB')}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
				{#if sar.source}<p class="hint">{sar.source}</p>{/if}
			{/if}
		</Disclosure>
	{/each}

	<h3>MIM product record<MimMark decorative /></h3>
	<dl class="facts">
		<div class="fact"><dt>MIM product</dt><dd>{details.product.product_name ?? '—'}<span class="basis mono">MIM #{details.product.product_id}</span></dd></div>
		<div class="fact"><dt>CEOS-ARD status as recorded in MIM</dt><dd>{details.product.statuses.join(', ') || '—'}</dd></div>
		<div class="fact"><dt>Level and type</dt><dd>{[details.product.level, details.product.type].filter(Boolean).join(' · ') || '—'}</dd></div>
		{#each details.product.instrument_links.filter((l) => l.provider_product_name || l.provider_product_code) as link (link.instrument_id)}<div class="fact"><dt>Provider product</dt><dd>{link.provider_product_name ?? '—'}{#if link.provider_product_code}<span class="basis mono">{link.provider_product_code}</span>{/if}</dd></div>{/each}
		{#if details.product.certification}<div class="fact"><dt>Certification as recorded in MIM</dt><dd>{[details.product.certification.spec_version, details.product.certification.approval_date ? `approved ${details.product.certification.approval_date}` : null].filter(Boolean).join(' · ') || '—'}</dd></div>{/if}
	</dl>
	<p class="hint">An agency and registry record, not the CEOS-ARD assessment: see <a href="#assessment-heading">CEOS-ARD assessment</a> above.{#if details.product.source} Recorded source: {details.product.source}{/if}</p>
</section>

<style>
	.mim-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
		gap: var(--space-1);
	}
	.mim-card {
		display: grid;
		gap: 6px;
		align-content: start;
	}
	.mim-legend {
		margin: 0;
		color: var(--text-secondary);
	}
	.mim-legend .mim-mark {
		margin: 0 2px 0 0;
		font-size: 1.1em;
	}
	.table-wrap:focus-visible {
		outline: var(--focus-width) solid var(--accent);
		outline-offset: var(--focus-offset);
	}
	.mim-figure {
		display: grid;
		gap: 4px;
		margin: 0 0 4px;
	}
	.mim-figure img {
		width: 100%;
		height: 120px;
		object-fit: contain;
		border-radius: var(--radius-control);
		background: #fffdf8;
	}
	.mim-figure img.silhouette {
		padding: 12px;
	}
	.mim-card h4 {
		font-size: 1rem;
		margin: 0;
	}
	.compact-facts {
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
	}
	.fact.wide {
		grid-column: 1 / -1;
	}
	.mode-code {
		margin-left: 0.5em;
	}
	.sar-heading {
		margin-top: var(--space-1);
		font-size: 0.95rem;
	}
	.table-wrap {
		overflow-x: auto;
	}
	.mim-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
		margin-top: var(--space-0);
	}
	.mim-table caption {
		text-align: left;
		font-weight: 600;
		padding-bottom: 4px;
	}
	.mim-table th,
	.mim-table td {
		padding: 6px 8px;
		border-bottom: 1px solid var(--line);
		text-align: left;
		vertical-align: top;
	}
</style>
