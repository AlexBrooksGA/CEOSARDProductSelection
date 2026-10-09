<script lang="ts">
	import { CRITERIA } from '$lib/domain/criteria';
	import { hasRefinements } from '$lib/domain/explorer';
	import { CEOS_FILTERS } from '$lib/domain/filters';
	import { CEOS_ARD_URL, FAMILIES, FAMILY_BY_VALUE, familyLabel } from '$lib/domain/guidance';
	import { PRODUCT_FAMILIES, SCOPE_LABELS } from '$lib/domain/profiles';
	import type { CeosFilter, CriterionMode, CriterionName } from '$lib/domain/types';
	import { app } from '$lib/state/app.svelte';
	import CriterionEditor from './CriterionEditor.svelte';
	import Disclosure from './Disclosure.svelte';
	import ExternalLink from './ExternalLink.svelte';
	import MimSource from './MimSource.svelte';

	let { onopenprofiles }: { onopenprofiles: () => void } = $props();
	const store = app();
	let explorer = $derived(store.explorer);

	// Search text is committed to the URL after a short pause (no history entry per keystroke).
	let search = $derived(explorer.search);
	let sensor = $derived(explorer.sensor);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	function commitText(field: 'search' | 'sensor', value: string, immediate = false) {
		clearTimeout(searchTimer);
		const apply = () => store.patch((draft) => void (draft[field] = value));
		if (immediate) apply();
		else searchTimer = setTimeout(apply, 350);
	}

	function setCriterion(name: CriterionName, mode: CriterionMode, value: number | string) {
		store.patch((draft) => void (draft.criteria[name] = { mode, value }));
	}
	function addCriterion(name: CriterionName) {
		const definition = CRITERIA.find((item) => item.name === name)!;
		store.patch((draft) => void (draft.criteria[name] = { mode: 'preferred', value: definition.defaultValue }));
		queueMicrotask(() => document.getElementById(`criterion-${name}-value`)?.focus());
	}
	function removeCriterion(name: CriterionName) {
		store.patch((draft) => void delete draft.criteria[name]);
	}
	function toggleListValue(field: 'providers' | 'operational' | 'sources', value: string, checked: boolean) {
		store.patch((draft) => {
			draft[field] = checked ? [...draft[field], value] : draft[field].filter((item) => item !== value);
		});
	}
	let familyInfo = $derived(FAMILY_BY_VALUE[explorer.family]);
	let moreCount = $derived(
		(explorer.criteria.radiometric_bit_depth ? 1 : 0) +
			(explorer.criteria.geographic_coverage ? 1 : 0) +
			explorer.providers.length +
			(explorer.sensor.trim() ? 1 : 0) +
			explorer.operational.length +
			explorer.sources.length +
			(explorer.hideUnknown ? 1 : 0)
	);
</script>

{#snippet criteriaGroup(group: 'primary' | 'more')}
	{#each CRITERIA.filter((definition) => definition.group === group) as definition (definition.name)}
		{@const setting = explorer.criteria[definition.name]}
		{#if setting}
			<CriterionEditor
				name={definition.name}
				mode={setting.mode}
				value={setting.value}
				onchange={(mode, value) => setCriterion(definition.name, mode, value)}
				onremove={() => removeCriterion(definition.name)}
			/>
		{:else}
			<button type="button" class="button small add" onclick={() => addCriterion(definition.name)}>+ {definition.label}</button>
		{/if}
	{/each}
{/snippet}

<div class="criteria-panel stack">
	<div class="field">
		<label for="search">Search product and mission names</label>
		<input
			id="search"
			type="search"
			value={search}
			maxlength="200"
			placeholder="e.g. Landsat, Sentinel-1, NRB"
			oninput={(event) => {
				search = event.currentTarget.value;
				commitText('search', search);
			}}
			onkeydown={(event) => event.key === 'Enter' && commitText('search', event.currentTarget.value, true)}
		/>
		<p class="hint">Literal text search of names. It does not infer a task or recommend products.</p>
	</div>

	<div class="field">
		<label for="family">Measurement family</label>
		<select id="family" value={explorer.family} onchange={(event) => store.patch((draft) => void (draft.family = event.currentTarget.value))}>
			{#each PRODUCT_FAMILIES as family (family)}<option value={family}>{familyLabel(family)}</option>{/each}
		</select>
		{#if familyInfo}<p class="hint">{familyInfo.explanation}</p>{/if}
		<Disclosure key="family-help" label="What the measurement families mean">
			<dl class="family-help">
				{#each FAMILIES as family (family.value)}
					<div><dt>{family.label}</dt><dd>{family.explanation}</dd></div>
				{/each}
			</dl>
			<p class="hint">Families follow the CEOS-ARD Product Family Specifications. <ExternalLink href={CEOS_ARD_URL}>CEOS-ARD overview</ExternalLink></p>
		</Disclosure>
	</div>

	<div class="field scope">
		<label for="scope">Catalogue scope</label>
		<select id="scope" value={explorer.scope} onchange={(event) => store.patch((draft) => void (draft.scope = event.currentTarget.value as CeosFilter))}>
			{#each CEOS_FILTERS as scope (scope)}<option value={scope}>{SCOPE_LABELS[scope]}</option>{/each}
		</select>
		<p class="hint">Scope is separate from your criteria; <strong>Clear criteria</strong> does not change it.</p>
	</div>

	<div class="profile-row panel-subtle stack-tight">
		<div class="spread">
			<span class="field-label">Profiles</span>
			<button type="button" class="button small" onclick={onopenprofiles}>Starting points and my profiles</button>
		</div>
		{#if store.activeProfile}
			<p class="small">
				Applied: <strong>{store.activeProfile.name}</strong>
				{#if store.activeProfileModified}<span class="badge info">Modified</span>{/if}
			</p>
			{#if store.activeProfileModified}
				<button type="button" class="button small" onclick={() => store.restoreProfileDefaults()}>Restore profile defaults</button>
			{/if}
		{:else}
			<p class="hint">Optional. Built-in profiles are illustrative starting points, not official requirements.</p>
		{/if}
	</div>

	<section class="stack" aria-labelledby="criteria-heading">
		<h2 id="criteria-heading" class="label">Screening criteria</h2>
		<p class="hint">Optional. Required separates products by reported values; Preferred only changes the order; Ignore keeps a value without using it.</p>
		{@render criteriaGroup('primary')}
	</section>

	<Disclosure key="more-filters" label={moreCount ? `More filters (${moreCount} active)` : 'More filters'}>
		<div class="stack">
			{@render criteriaGroup('more')}
			{#if store.providers.length}
				<fieldset class="field">
					<legend>Data provider or producer</legend>
					<div class="check-list">
						{#each store.providers as provider (provider)}
							<label class="check"><input type="checkbox" checked={explorer.providers.includes(provider)} onchange={(event) => toggleListValue('providers', provider, event.currentTarget.checked)} />{provider}</label>
						{/each}
					</div>
				</fieldset>
			{/if}
			<div class="field">
				<label for="sensor">Sensor or instrument type contains</label>
				<input
					id="sensor"
					type="text"
					value={sensor}
					maxlength="100"
					oninput={(event) => {
						sensor = event.currentTarget.value;
						commitText('sensor', sensor);
					}}
				/>
			</div>
			{#if store.operationalStatuses.length}
				<fieldset class="field">
					<legend>Operational status</legend>
					<div class="check-list">
						{#each store.operationalStatuses as status (status)}
							<label class="check"><input type="checkbox" checked={explorer.operational.includes(status)} onchange={(event) => toggleListValue('operational', status, event.currentTarget.checked)} />{status}</label>
						{/each}
					</div>
				</fieldset>
			{/if}
			{#if store.sourceTypes.length > 1 || explorer.sources.length}
				<fieldset class="field">
					<legend>Record source</legend>
					{#each store.sourceTypes as source (source)}
						<label class="check"><input type="checkbox" checked={explorer.sources.includes(source)} onchange={(event) => toggleListValue('sources', source, event.currentTarget.checked)} />{source === 'curated_ceos_ard' ? 'Curated CEOS-ARD record' : source}</label>
					{/each}
				</fieldset>
			{/if}
			<label class="check">
				<input type="checkbox" checked={explorer.hideUnknown} onchange={(event) => store.patch((draft) => void (draft.hideUnknown = event.currentTarget.checked))} />
				<span>Hide records with unreported values for active criteria<span class="hint" style="display:block">Unreported is not a mismatch; hidden records stay recoverable here.</span></span>
			</label>
		</div>
	</Disclosure>

	<MimSource />

	<div class="row actions">
		<button type="button" class="button" disabled={!hasRefinements(explorer)} onclick={() => store.clearCriteria()}>Clear criteria</button>
		{#if store.undo}
			<button type="button" class="button plain" onclick={() => store.undoLast()}>Undo: {store.undo.label}</button>
		{/if}
	</div>
</div>

<style>
	.add {
		justify-self: start;
	}
	.family-help {
		display: grid;
		gap: 8px;
		margin: 0 0 8px;
		font-size: 0.875rem;
	}
	.family-help dt {
		font-weight: 600;
	}
	.family-help dd {
		margin: 0;
		color: var(--text-secondary);
	}
	.check-list {
		display: grid;
		gap: 6px;
		max-height: 220px;
		overflow: auto;
		padding-right: 4px;
	}
	.actions {
		padding-top: var(--space-1);
		border-top: 1px solid var(--line);
	}
</style>
