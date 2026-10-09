<script lang="ts">
	import { tick } from 'svelte';
	import { CRITERION_BY_NAME, MODE_LABELS } from '$lib/domain/criteria';
	import {
		assumptions,
		defaultOutput,
		hasPurpose,
		measurementNote,
		outputNote,
		questionsFor,
		resolveChecks,
		sourcesFor,
		timeframeRange,
		TEXT_MAX,
		type RegionOption
	} from '$lib/domain/purpose';
	import type { CriterionMode } from '$lib/domain/types';
	import { app } from '$lib/state/app.svelte';
	import ExternalLink from '../ExternalLink.svelte';
	import Choice from './Choice.svelte';
	import PurposeBackdrop from './PurposeBackdrop.svelte';
	import RegionIcon from './RegionIcon.svelte';
	import RegionSprite from './RegionSprite.svelte';

	let { onapplied }: { onapplied: () => void } = $props();
	const store = app();
	const g = store.guidance;
	let draft = $derived(store.draft);
	let goal = $derived(g.goals.find((item) => item.id === draft.goal) ?? null);
	let context = $derived(g.contexts.find((item) => item.id === draft.context) ?? null);
	let questions = $derived(questionsFor(g, draft.goal, draft.context));
	let measurement = $derived(g.measurements.find((item) => item.id === draft.measurement) ?? null);
	let ready = $derived(hasPurpose(draft));
	let proposal = $derived(store.proposal);
	let checks = $derived(resolveChecks(g, draft));
	let editing = $derived(Boolean(store.session.purpose.applied) || Boolean(store.explorer.purpose));
	let connective = $derived(context && context.id !== 'custom' ? context.phrase.split(' ')[0] : 'in');
	let setupOpen = $derived(store.isOpen('purpose:setup', false));
	let showTechnical = $state(false);
	let technicalOpen = $derived(showTechnical || store.experience === 'specialist' || Boolean(draft.resolution || draft.revisit));
	let imageryInfo = $state(false);
	const timeframes = g.timeframes.map((t) => ({ ...t, hint: timeframeRange(t) ?? t.hint }));

	/** One plain sentence describing where the catalogue will start. */
	let setupSummary = $derived.by(() => {
		const family = proposal.settings.family === 'All product families' ? 'all measurement families' : `${measurement?.label ?? 'one measurement family'} products`;
		const limits = [proposal.settings.spatial_resolution_m, proposal.settings.revisit_days].filter(Boolean).length;
		const limitText = limits ? `${limits} technical limit${limits > 1 ? 's' : ''} you set` : 'no numeric limits';
		return `Starts with ${family}, ${limitText}, and ${checks.length} checks to make on each product.`;
	});

	function set<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
		const patch: Partial<typeof draft> = { [key]: value };
		// Keep the sentence coherent: drop a question that no longer fits the goal or context.
		if (key === 'goal' || key === 'context') {
			const next = { ...draft, ...patch };
			if (next.question && !questionsFor(g, next.goal, next.context).some((q) => q.id === next.question)) patch.question = null;
		}
		store.updateDraft(patch);
	}
	const val = (value: string) => (value === '' ? null : value);

	function setCriterion(name: 'resolution' | 'revisit', field: 'mode' | 'value', raw: string) {
		const current = draft[name];
		const definitionName = name === 'resolution' ? 'spatial_resolution_m' : 'revisit_days';
		const definition = CRITERION_BY_NAME[definitionName];
		if (field === 'value') {
			if (raw.trim() === '') return store.updateDraft({ [name]: null });
			const number = Number(raw);
			if (definition.kind !== 'number' || !Number.isFinite(number) || number < definition.min || number > definition.max) return;
			store.updateDraft({ [name]: { mode: current?.mode ?? 'preferred', value: number } });
		} else if (current) {
			store.updateDraft({ [name]: { ...current, mode: raw as CriterionMode } });
		}
	}

	async function apply(event?: SubmitEvent) {
		event?.preventDefault();
		// Only the explicit button applies; Enter in a text field never applies settings.
		if (!ready || (event && !(event.submitter as HTMLElement | null)?.classList.contains('cta'))) return;
		await store.applyPurpose();
		await tick();
		onapplied();
	}
</script>

{#snippet regionIcon(option: RegionOption)}<RegionIcon icon={option.icon} />{/snippet}

<section class="journey" aria-labelledby="journey-title">
	<PurposeBackdrop family={store.visual.family} detail={store.visual.detail} />
	<RegionSprite />
	<form class="journey-inner frame" onsubmit={apply}>
		<!-- Disabled default button: pressing Enter in a field never submits (implicit submission is blocked). -->
		<button type="submit" disabled hidden aria-hidden="true" tabindex="-1"></button>

		<div class="journey-top">
			<div class="imagery">
				<button type="button" class="imagery-button" aria-expanded={imageryInfo} aria-controls="imagery-info" onclick={() => (imageryInfo = !imageryInfo)}>
					Illustrative imagery <span aria-hidden="true">ⓘ</span>
				</button>
				<p id="imagery-info" class="imagery-info" hidden={!imageryInfo}>
					AI-generated picture of a fictional wetland. The radar and thermal looks are stylised from the same picture. None of it is satellite data, a calibrated resolution or evidence about any product; it changes with the measurement and detail you choose only as a visual cue, and it does not show your area or dates.
				</p>
			</div>
			{#if editing}
				<button type="button" class="skip" onclick={() => store.closeJourney()}>Back to results</button>
			{:else}
				<button type="button" class="skip" onclick={() => store.skipJourney()}>Skip to catalogue</button>
			{/if}
		</div>

		<h1 id="journey-title">Find Earth observation data for your purpose.</h1>
		<p class="intro">Answer in your own words. We’ll suggest where to start in the catalogue. Nothing changes until you choose <strong>Find candidate products</strong>.</p>

		<p class="aside visually-hidden" id="sentence-help">Complete the sentence. Only what you want to do is needed; everything else is optional.</p>

		<p class="line lead">
			<span class="conn" aria-hidden="true">I’m{' '}</span><Choice label="Your experience with Earth observation data" value={draft.experience} options={g.experience} placeholder="new, familiar or a specialist" onchange={(id) => set('experience', val(id) as typeof draft.experience)} /><span class="conn" aria-hidden="true">.</span>
		</p>

		<p class="line sentence">
			<span class="conn" aria-hidden="true">I want to{' '}</span><Choice label="What do you want to do?" value={draft.goal} options={g.goals} placeholder="choose an aim" describedby="sentence-help" onchange={(id) => set('goal', val(id))} />{#if draft.goal === 'custom'}<span class="conn" aria-hidden="true">:{' '}</span><label class="inline-text"><span class="text-label">Describe your purpose</span><input type="text" value={draft.goalText} maxlength={TEXT_MAX} size="18" placeholder="describe your purpose" oninput={(e) => set('goalText', e.currentTarget.value)} /></label>{/if}
			<span class="conn" aria-hidden="true">{connective}{' '}</span><Choice label="Where, or in what setting?" value={draft.context} options={g.contexts} placeholder="a setting" onchange={(id) => set('context', val(id))} />{#if draft.context === 'custom'}<span class="conn" aria-hidden="true">{' '}</span><label class="inline-text"><span class="text-label">Describe the setting</span><input type="text" value={draft.contextText} maxlength={TEXT_MAX} size="12" placeholder="e.g. mangroves" oninput={(e) => set('contextText', e.currentTarget.value)} /></label>{/if}<span class="conn" aria-hidden="true">, to understand{' '}</span><Choice label="What do you want to understand?" value={draft.question} options={questions} placeholder="something specific" onchange={(id) => set('question', val(id))} />{#if draft.question === 'custom'}<span class="conn" aria-hidden="true">{' '}</span><label class="inline-text"><span class="text-label">Describe your question</span><input type="text" value={draft.questionText} maxlength={TEXT_MAX} size="16" placeholder="your question" oninput={(e) => set('questionText', e.currentTarget.value)} /></label>{/if}{#if draft.goal}<span class="conn" aria-hidden="true">, across{' '}</span><Choice label="Region (optional)" value={draft.region} options={g.regions} placeholder="any region" icon={regionIcon} describedby="private-help" onchange={(id) => set('region', val(id))} />{#if draft.region === 'custom'}<span class="conn" aria-hidden="true">{' '}</span><label class="inline-text"><span class="text-label">Place (optional)</span><input type="text" value={draft.area} maxlength={TEXT_MAX} size="14" placeholder="name the place" aria-describedby="private-help" oninput={(e) => set('area', e.currentTarget.value)} /></label>{/if}<span class="conn" aria-hidden="true">{' '}over{' '}</span><Choice label="Period (optional)" value={draft.timeframe} options={timeframes} placeholder="any period" describedby="private-help" onchange={(id) => set('timeframe', val(id))} />{#if draft.timeframe === 'custom'}<span class="conn" aria-hidden="true">{' '}</span><label class="inline-text"><span class="text-label">Dates (optional)</span><input type="text" value={draft.period} maxlength={TEXT_MAX} size="12" placeholder="e.g. 2015–2024" aria-describedby="private-help" oninput={(e) => set('period', e.currentTarget.value)} /></label>{/if}{/if}<span class="conn" aria-hidden="true">.</span>
		</p>

		{#if draft.goal}
			<p class="line details">
				<span class="conn" aria-hidden="true">I’d like to produce{' '}</span><Choice label="Intended output" value={draft.output ?? defaultOutput(draft, g)} options={g.outputs} placeholder="an output" onchange={(id) => set('output', val(id))} /><span class="conn" aria-hidden="true">{' '}from{' '}</span><Choice label="Measurement" value={draft.measurement ?? 'decide'} options={g.measurements} placeholder="help me decide" onchange={(id) => set('measurement', val(id))} /><span class="conn" aria-hidden="true">{' '}data, distinguishing{' '}</span><Choice label="Spatial detail" value={draft.detail ?? 'decide'} options={g.details} placeholder="help me decide" onchange={(id) => set('detail', val(id))} />{#if goal?.kind === 'change'}<span class="conn" aria-hidden="true">{' '}and observing change{' '}</span><Choice label="How often" value={draft.frequency ?? 'unsure'} options={g.frequencies} placeholder="not sure yet" onchange={(id) => set('frequency', val(id))} />{/if}<span class="conn" aria-hidden="true">.</span>
			</p>
			{#if measurement && measurement.id !== 'decide'}<p class="aside">{measurement.explanation}</p>{/if}
			<p id="private-help" class="aside">Your experience, region, period and anything you type stay in this browser tab. They are not searched, mapped or shared in links.</p>
		{/if}

		{#if ready}
			<section id="setup-details" class="preview" aria-labelledby="preview-heading" hidden={!setupOpen}>
				<div class="preview-head">
					<h2 id="preview-heading">Your starting setup</h2>
					<span class="status">{store.draftStatus.label}</span>
				</div>

				<table class="proposed">
					<caption class="visually-hidden">Proposed filters, their importance and why</caption>
					<thead><tr><th scope="col">Filter</th><th scope="col">Proposed</th><th scope="col">Importance</th><th scope="col">Why</th></tr></thead>
					<tbody>
						{#each proposal.proposed as item (item.label)}
							<tr><th scope="row">{item.label}</th><td>{item.value}</td><td>{item.mode}</td><td>{item.reason}</td></tr>
						{/each}
					</tbody>
				</table>

				<button type="button" class="link" aria-expanded={technicalOpen} aria-controls="technical-limits" onclick={() => (showTechnical = !technicalOpen)}>Set a technical limit yourself (optional)</button>
				<div id="technical-limits" class="technical" hidden={!technicalOpen}>
					{#each [['resolution', 'spatial_resolution_m'], ['revisit', 'revisit_days']] as const as [name, criterion] (name)}
						{@const definition = CRITERION_BY_NAME[criterion]}
						{@const setting = draft[name]}
						<div class="limit">
							<label for="limit-{name}">{definition.label} {definition.comparator} ({definition.unit})</label>
							<input id="limit-{name}" type="number" inputmode="decimal" min={definition.kind === 'number' ? definition.min : undefined} max={definition.kind === 'number' ? definition.max : undefined} step="any" value={setting?.value ?? ''} placeholder="not set" onchange={(e) => setCriterion(name, 'value', e.currentTarget.value)} />
							<label class="visually-hidden" for="limit-{name}-mode">{definition.label} importance</label>
							<select id="limit-{name}-mode" value={setting?.mode ?? 'preferred'} disabled={!setting} onchange={(e) => setCriterion(name, 'mode', e.currentTarget.value)}>
								{#each ['required', 'preferred', 'not_used'] as const as mode (mode)}<option value={mode}>{MODE_LABELS[mode]}</option>{/each}
							</select>
						</div>
					{/each}
					<p class="aside">Only values you enter become filters. Pixel spacing is not feature detectability or positional accuracy; nominal revisit is not a count of usable observations.</p>
				</div>

				<div class="preview-grid">
					<div>
						<h3>The catalogue can’t check this for you</h3>
						<ul>
							{#each proposal.notes as note (note)}<li>{note}</li>{/each}
							{#each assumptions(g, draft) as note (note)}<li>{note}</li>{/each}
							{#if outputNote(g, draft)}<li>{outputNote(g, draft)}</li>{/if}
							{#if draft.measurement && measurementNote(g, draft, draft.measurement)}<li>{measurementNote(g, draft, draft.measurement)}</li>{/if}
						</ul>
					</div>
					<div>
						<h3>Checks you’ll see on each product ({checks.length})</h3>
						<ul class="checks">{#each checks as check (check.id)}<li>{check.label}</li>{/each}</ul>
						{#if sourcesFor(g, [...new Set(checks.flatMap((c) => c.sources))]).length}
							<p class="aside">
								Drawn from:
								{#each sourcesFor(g, [...new Set(checks.flatMap((c) => c.sources))]) as source, index (source.id)}{#if index}{'; '}{/if}<ExternalLink href={source.url}>{source.short} ({source.year})</ExternalLink>{/each}
							</p>
						{/if}
					</div>
				</div>

				{#if proposal.changes.length && editing}
					<div class="changes">
						<h3>Changes from your current filters</h3>
						<ul>{#each proposal.changes as change (change.label)}<li><strong>{change.label}:</strong> {change.from} → {change.to}</li>{/each}</ul>
					</div>
				{/if}
				<p class="aside"><strong>Stays as it is:</strong> {proposal.retained.join('; ')}. Your shortlist, comparison, profiles and notes are never changed.</p>
			</section>

			<div class="action-bar">
				<div class="setup-summary">
					<p class="summary-text">{setupSummary}</p>
					<p class="summary-meta">
						{store.draftStatus.label}.
						<button type="button" class="link" aria-expanded={setupOpen} aria-controls="setup-details" onclick={() => store.setOpen('purpose:setup', !setupOpen)}>{setupOpen ? 'Hide starting setup' : 'Review starting setup'}</button>
					</p>
				</div>
				<div class="bar-actions">
					<button type="button" class="quiet" onclick={() => store.resetDraft()}>Reset answers</button>
					<button type="submit" class="cta">Find candidate products</button>
				</div>
			</div>
			{#if editing && proposal.changes.length && !setupOpen}
				<p class="aside">This changes {proposal.changes.length === 1 ? 'one of your current filters' : `${proposal.changes.length} of your current filters`}; review the starting setup to see which.</p>
			{/if}
		{:else}
			<p class="aside start-hint">Choose what you want to do to see where to start, or skip straight to the catalogue.</p>
		{/if}
	</form>
</section>

<style>
	.journey {
		--pj-ink: #d5dfe8;
		--pj-ink-strong: #ffffff;
		--pj-muted: #93a6b8;
		--pj-placeholder: #9fb6c6;
		--pj-label: #9fd8d1;
		--pj-accent: #5eead4;
		position: relative;
		isolation: isolate;
		min-height: calc(100svh - var(--nav-height));
		padding-block: clamp(20px, 3vh, 32px) clamp(40px, 8vh, 96px);
		background: #060b16;
		color: var(--pj-ink);
	}
	.journey-inner {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}
	.journey-top {
		display: flex;
		align-self: stretch;
		align-items: flex-start;
		justify-content: flex-end;
		gap: 12px;
	}
	.imagery {
		display: grid;
		justify-items: end;
		gap: 8px;
		max-width: 340px;
	}
	.imagery-button {
		min-height: 40px;
		padding: 6px 12px;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--pj-muted);
		font-size: 0.85rem;
		cursor: pointer;
	}
	.imagery-button:hover {
		color: var(--pj-ink-strong);
	}
	.imagery-info {
		margin: 0;
		padding: 12px 14px;
		border: 1px solid rgb(255 255 255 / 0.1);
		border-radius: 12px;
		background: rgb(11 20 36 / 0.94);
		color: var(--pj-ink);
		font-size: 0.85rem;
		line-height: 1.5;
	}
	.skip {
		min-height: 40px;
		padding: 8px 18px;
		border: 1px solid rgb(255 255 255 / 0.22);
		border-radius: var(--radius-pill);
		background: rgb(6 11 22 / 0.5);
		color: var(--pj-ink-strong);
		font-weight: 500;
		cursor: pointer;
		backdrop-filter: blur(6px);
	}
	.skip:hover {
		border-color: rgb(255 255 255 / 0.45);
	}
	h1 {
		max-width: 18ch;
		margin: clamp(24px, 7vh, 72px) 0 0;
		font-size: clamp(2.3rem, 1.5rem + 2.4vw, 3.6rem);
		font-weight: 600;
		line-height: 1.02;
		letter-spacing: -0.03em;
		color: var(--pj-ink-strong);
		text-wrap: balance;
	}
	.intro {
		max-width: 50ch;
		margin: 18px 0 0;
		font-size: 1.0625rem;
		line-height: 1.55;
		color: #aebdcb;
	}
	.intro strong {
		color: var(--pj-ink);
		font-weight: 600;
	}

	/* The sentence: real prose with inline choices, so it wraps like text. */
	.line {
		margin: 0;
		max-width: 34em;
		text-wrap: pretty;
	}
	.lead {
		margin-top: clamp(32px, 6vh, 56px);
		font-size: clamp(1.05rem, 0.95rem + 0.35vw, 1.25rem);
		line-height: 1.7;
		color: #b9c8d5;
	}
	.sentence {
		margin-top: 10px;
		max-width: 26em;
		font-size: clamp(1.55rem, 1.05rem + 1.45vw, 2.35rem);
		font-weight: 400;
		line-height: 1.5;
		letter-spacing: -0.012em;
		color: var(--pj-ink);
	}
	.details {
		margin-top: 22px;
		max-width: 36em;
		font-size: clamp(1.05rem, 0.95rem + 0.35vw, 1.25rem);
		line-height: 1.75;
		color: #b9c8d5;
	}
	.inline-text {
		display: inline-block;
	}
	.text-label {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
	.inline-text input {
		field-sizing: content;
		min-width: 6ch;
		max-width: 22ch;
		min-height: 0;
		padding: 0 0.15em;
		border: 0;
		border-bottom: 1px dashed var(--pj-accent);
		border-radius: 0;
		background: transparent;
		color: var(--pj-ink-strong);
		font: inherit;
		font-weight: 500;
		line-height: 1.2;
	}
	.inline-text input::placeholder {
		color: var(--pj-placeholder);
		font-weight: 400;
	}
	.inline-text input:focus-visible {
		outline: 2px solid var(--pj-accent);
		outline-offset: 3px;
	}
	.aside {
		max-width: 62ch;
		margin: 12px 0 0;
		font-size: 0.9rem;
		line-height: 1.55;
		color: var(--pj-muted);
	}
	.aside :global(a),
	.preview :global(a) {
		color: #8ff0e1;
	}
	.start-hint {
		margin-top: 28px;
	}

	/* Sticky action bar: the next step is always one click away. */
	.action-bar {
		position: sticky;
		bottom: 16px;
		z-index: 5;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 14px 24px;
		align-self: stretch;
		max-width: 960px;
		margin-top: 32px;
		padding: 14px 14px 14px 22px;
		border: 1px solid rgb(255 255 255 / 0.1);
		border-radius: 20px;
		background: rgb(9 16 30 / 0.82);
		box-shadow: 0 24px 60px -24px rgb(0 0 0 / 0.8);
		backdrop-filter: blur(14px) saturate(1.2);
	}
	.setup-summary {
		display: grid;
		gap: 2px;
		flex: 1 1 320px;
		min-width: 0;
	}
	.summary-text {
		margin: 0;
		color: var(--pj-ink-strong);
		font-weight: 500;
	}
	.summary-meta {
		margin: 0;
		font-size: 0.85rem;
		color: var(--pj-muted);
	}
	.bar-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.cta {
		min-height: 48px;
		padding: 12px 24px;
		white-space: nowrap;
		border: 0;
		border-radius: 14px;
		background: var(--pj-accent);
		color: #04201c;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 160ms ease;
	}
	.cta:hover {
		background: #8ff0e1;
	}
	.quiet {
		min-height: 44px;
		padding: 8px 14px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: var(--pj-muted);
		font-weight: 500;
		cursor: pointer;
	}
	.quiet:hover {
		color: var(--pj-ink-strong);
	}
	.link {
		justify-self: start;
		min-height: 32px;
		padding: 0;
		border: 0;
		background: none;
		color: #8ff0e1;
		font: inherit;
		font-weight: 500;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.cta:focus-visible,
	.skip:focus-visible,
	.quiet:focus-visible,
	.link:focus-visible,
	.imagery-button:focus-visible {
		outline: 2px solid #ffffff;
		outline-offset: 3px;
	}

	/* Starting setup: optional detail, glass over the scene. */
	.preview {
		display: grid;
		gap: 18px;
		align-self: stretch;
		max-width: 960px;
		margin-top: 32px;
		padding: clamp(18px, 3vw, 28px);
		border: 1px solid rgb(255 255 255 / 0.08);
		border-radius: 20px;
		background: rgb(9 16 30 / 0.78);
		backdrop-filter: blur(16px) saturate(1.2);
		color: var(--pj-ink);
	}
	.preview[hidden] {
		display: none;
	}
	.preview-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}
	.preview h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--pj-ink-strong);
	}
	.preview h3 {
		margin-bottom: 8px;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--pj-ink-strong);
	}
	.status {
		padding: 2px 10px;
		border: 1px solid rgb(251 191 36 / 0.5);
		border-radius: var(--radius-pill);
		color: #fcd98a;
		font-size: 0.8rem;
	}
	.proposed {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.92rem;
	}
	.proposed th,
	.proposed td {
		padding: 9px 10px;
		border-top: 1px solid rgb(255 255 255 / 0.08);
		text-align: left;
		vertical-align: top;
		color: var(--pj-ink);
	}
	.proposed thead th {
		border-top: 0;
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--pj-muted);
	}
	.proposed tbody th {
		color: var(--pj-ink-strong);
		font-weight: 600;
	}
	.technical {
		display: grid;
		gap: 10px;
		padding: 14px 16px;
		border: 1px solid rgb(255 255 255 / 0.08);
		border-radius: 14px;
	}
	.technical[hidden] {
		display: none;
	}
	.limit {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
	}
	.limit label {
		min-width: 16ch;
		color: var(--pj-ink);
		font-weight: 500;
	}
	.limit input,
	.limit select {
		width: auto;
		min-height: 40px;
		background: #0f1a2e;
		color: #ffffff;
		border: 1px solid rgb(255 255 255 / 0.18);
	}
	.limit input {
		width: 9rem;
	}
	.preview-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
		gap: 24px;
	}
	.preview ul {
		display: grid;
		gap: 6px;
		margin: 0;
		padding-left: 18px;
		font-size: 0.9rem;
		line-height: 1.5;
		color: #c3d0db;
	}
	.changes {
		padding: 12px 16px;
		border-left: 3px solid #fbbf24;
		background: rgb(251 191 36 / 0.08);
	}

	@media (max-width: 767px) {
		.journey {
			padding-block: 16px 48px;
		}
		.journey-top {
			justify-content: space-between;
		}
		.imagery {
			justify-items: start;
		}
		h1 {
			margin-top: 20px;
		}
		/* The sentence becomes a sequence of labelled fields. */
		.line {
			display: grid;
			gap: 14px;
			width: 100%;
			font-size: 1.05rem;
			line-height: 1.4;
		}
		.lead {
			margin-top: 28px;
		}
		.sentence,
		.details {
			margin-top: 14px;
		}
		.conn {
			display: none;
		}
		.inline-text {
			display: grid;
			gap: 6px;
		}
		.text-label {
			position: static;
			width: auto;
			height: auto;
			overflow: visible;
			clip: auto;
			white-space: normal;
			font-size: 0.85rem;
			font-weight: 600;
			color: var(--pj-label);
		}
		.inline-text input {
			field-sizing: fixed;
			width: 100%;
			max-width: none;
			min-height: 48px;
			padding: 10px 14px;
			border: 1px solid rgb(255 255 255 / 0.14);
			border-radius: 12px;
			background: rgb(255 255 255 / 0.04);
		}
		.action-bar {
			bottom: 8px;
			gap: 10px;
			padding: 12px;
		}
		.summary-text {
			font-size: 0.92rem;
		}
		.summary-meta {
			font-size: 0.8rem;
		}
		.bar-actions {
			flex-wrap: nowrap;
			width: 100%;
		}
		.quiet {
			padding-inline: 6px;
		}
		.cta {
			flex: 1;
			padding-inline: 16px;
		}
		.proposed thead {
			display: none;
		}
		.proposed tr {
			display: grid;
			padding: 8px 0;
			border-top: 1px solid rgb(255 255 255 / 0.08);
		}
		.proposed th,
		.proposed td {
			padding: 2px 0;
			border: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.cta {
			transition: none;
		}
	}
</style>
