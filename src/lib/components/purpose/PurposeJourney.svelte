<script lang="ts">
	import { tick } from 'svelte';
	import { CRITERION_BY_NAME, MODE_LABELS } from '$lib/domain/criteria';
	import { hasPurpose, outputLabel, outputNote, assumptions, measurementNote, purposeSentence, questionsFor, resolveChecks, sourcesFor, defaultOutput, TEXT_MAX } from '$lib/domain/purpose';
	import type { CriterionMode } from '$lib/domain/types';
	import { app } from '$lib/state/app.svelte';
	import ExternalLink from '../ExternalLink.svelte';
	import PurposeBackdrop from './PurposeBackdrop.svelte';

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
	let showTechnical = $state(false);

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

<section class="journey" aria-labelledby="journey-title">
	<PurposeBackdrop family={store.visual.family} detail={store.visual.detail} />
	<div class="journey-inner frame">
		<div class="journey-top">
			<p class="kicker">CEOS-ARD Product Explorer</p>
			{#if editing}
				<button type="button" class="skip" onclick={() => store.closeJourney()}>Back to results <span aria-hidden="true">→</span></button>
			{:else}
				<button type="button" class="skip" onclick={() => store.skipJourney()}>Skip to catalogue <span aria-hidden="true">→</span></button>
			{/if}
		</div>

		<h1 id="journey-title">Find Earth observation data for your purpose.</h1>
		<p class="intro">Describe what you need. We’ll suggest a starting set of filters and the checks worth making — nothing changes until you choose <strong>Find candidate products</strong>.</p>

		<form class="sentence" onsubmit={apply} aria-describedby="sentence-help">
			<!-- Disabled default button: pressing Enter in a field never submits (implicit submission is blocked). -->
			<button type="submit" disabled hidden aria-hidden="true" tabindex="-1"></button>
			<p id="sentence-help" class="visually-hidden">Complete the sentence. Only the first choice is needed; everything else is optional.</p>
			<div class="line">
				<span class="connective" aria-hidden="true">I want to</span>
				<label class="blank">
					<span class="blank-label">What do you want to do?</span>
					<select value={draft.goal ?? ''} onchange={(e) => set('goal', val(e.currentTarget.value))} class:empty={!draft.goal}>
						<option value="">choose…</option>
						{#each g.goals as option (option.id)}<option value={option.id}>{option.label}</option>{/each}
					</select>
				</label>
				{#if draft.goal === 'custom'}
					<label class="blank text">
						<span class="blank-label">Describe your purpose</span>
						<input type="text" value={draft.goalText} maxlength={TEXT_MAX} placeholder="describe your purpose" oninput={(e) => set('goalText', e.currentTarget.value)} />
					</label>
				{/if}
				<span class="connective" aria-hidden="true">{connective}</span>
				<label class="blank">
					<span class="blank-label">Where, or in what setting?</span>
					<select value={draft.context ?? ''} onchange={(e) => set('context', val(e.currentTarget.value))} class:empty={!draft.context}>
						<option value="">choose a setting…</option>
						{#each g.contexts as option (option.id)}<option value={option.id}>{option.label}</option>{/each}
					</select>
				</label>
				{#if draft.context === 'custom'}
					<label class="blank text">
						<span class="blank-label">Describe the setting</span>
						<input type="text" value={draft.contextText} maxlength={TEXT_MAX} placeholder="e.g. mangroves" oninput={(e) => set('contextText', e.currentTarget.value)} />
					</label>
				{/if}
				<span class="connective punct" aria-hidden="true">, to understand</span>
				<label class="blank">
					<span class="blank-label">What do you want to understand?</span>
					<select value={draft.question ?? ''} onchange={(e) => set('question', val(e.currentTarget.value))} class:empty={!draft.question}>
						<option value="">choose…</option>
						{#each questions as option (option.id)}<option value={option.id}>{option.label}</option>{/each}
					</select>
				</label>
				{#if draft.question === 'custom'}
					<label class="blank text">
						<span class="blank-label">Describe your question</span>
						<input type="text" value={draft.questionText} maxlength={TEXT_MAX} placeholder="your question" oninput={(e) => set('questionText', e.currentTarget.value)} />
					</label>
				{/if}
				<span class="connective punct" aria-hidden="true">.</span>
			</div>

			{#if draft.goal}
				<div class="line follow">
					<span class="connective" aria-hidden="true">My area is</span>
					<label class="blank text">
						<span class="blank-label">Area (optional)</span>
						<input type="text" value={draft.area} maxlength={TEXT_MAX} placeholder="optional place or description" oninput={(e) => set('area', e.currentTarget.value)} aria-describedby="private-help" />
					</label>
					<span class="connective" aria-hidden="true">and my period is</span>
					<label class="blank text">
						<span class="blank-label">Period (optional)</span>
						<input type="text" value={draft.period} maxlength={TEXT_MAX} placeholder="optional dates" oninput={(e) => set('period', e.currentTarget.value)} aria-describedby="private-help" />
					</label>
					<span class="connective punct" aria-hidden="true">.</span>
				</div>
				<p id="private-help" class="aside">Kept privately in this browser tab for your record. It is not searched, mapped, shared in links or checked against acquisitions.</p>

				<div class="line follow">
					<span class="connective" aria-hidden="true">I’d like to produce</span>
					<label class="blank">
						<span class="blank-label">Intended output</span>
						<select value={draft.output ?? defaultOutput(draft, g) ?? ''} onchange={(e) => set('output', val(e.currentTarget.value))}>
							<option value="">choose…</option>
							{#each g.outputs as option (option.id)}<option value={option.id}>{option.label}</option>{/each}
						</select>
					</label>
					<span class="connective punct" aria-hidden="true">, using</span>
					<label class="blank">
						<span class="blank-label">Measurement</span>
						<select value={draft.measurement ?? 'decide'} onchange={(e) => set('measurement', val(e.currentTarget.value))}>
							{#each g.measurements as option (option.id)}<option value={option.id}>{option.label}</option>{/each}
						</select>
					</label>
					<span class="connective" aria-hidden="true">data.</span>
				</div>
				{#if measurement && measurement.id !== 'decide'}<p class="aside">{measurement.explanation}</p>{/if}

				<div class="line follow">
					<span class="connective" aria-hidden="true">I need to distinguish</span>
					<label class="blank">
						<span class="blank-label">Spatial detail</span>
						<select value={draft.detail ?? 'decide'} onchange={(e) => set('detail', val(e.currentTarget.value))}>
							{#each g.details as option (option.id)}<option value={option.id}>{option.label}</option>{/each}
						</select>
					</label>
					{#if goal?.kind === 'change'}
						<span class="connective" aria-hidden="true">and observe changes</span>
						<label class="blank">
							<span class="blank-label">How often</span>
							<select value={draft.frequency ?? 'unsure'} onchange={(e) => set('frequency', val(e.currentTarget.value))}>
								{#each g.frequencies as option (option.id)}<option value={option.id}>{option.label}</option>{/each}
							</select>
						</label>
					{/if}
					<span class="connective punct" aria-hidden="true">.</span>
				</div>
			{/if}

			{#if ready}
				<section class="preview" aria-labelledby="preview-heading">
					<div class="preview-head">
						<h2 id="preview-heading">Your starting setup</h2>
						<span class="status">{store.draftStatus.label}</span>
					</div>
					<p class="echo">{purposeSentence(draft, g)}{#if outputLabel(draft, g)}{' '}Output: {outputLabel(draft, g)}.{/if}</p>

					<table class="proposed">
						<caption class="visually-hidden">Proposed filters, their importance and why</caption>
						<thead><tr><th scope="col">Filter</th><th scope="col">Proposed</th><th scope="col">Importance</th><th scope="col">Why</th></tr></thead>
						<tbody>
							{#each proposal.proposed as item (item.label)}
								<tr><th scope="row">{item.label}</th><td>{item.value}</td><td>{item.mode}</td><td>{item.reason}</td></tr>
							{/each}
						</tbody>
					</table>

					<button type="button" class="link" aria-expanded={showTechnical || Boolean(draft.resolution || draft.revisit)} aria-controls="technical-limits" onclick={() => (showTechnical = !showTechnical)}>
						Set a technical limit yourself (optional)
					</button>
					<div id="technical-limits" class="technical" hidden={!(showTechnical || draft.resolution || draft.revisit)}>
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

					<div class="actions">
						<button type="submit" class="cta">Find candidate products</button>
						<button type="button" class="secondary-action" onclick={() => store.resetDraft()}>Reset answers</button>
					</div>
					<p class="aside">Applies once. Afterwards the filters are yours to change, and you can undo.</p>
				</section>
			{:else}
				<p class="aside start-hint">Choose what you want to do to see a suggested setup — or skip straight to the catalogue.</p>
			{/if}
		</form>
	</div>
</section>

<style>
	.punct {
		margin-left: -8px;
	}
	.journey {
		position: relative;
		isolation: isolate;
		color: #eef4f8;
		min-height: min(78vh, 720px);
		padding-block: var(--space-4) calc(var(--space-6) + 24px);
		background: #060b16;
	}
	.journey-inner {
		position: relative;
		z-index: 1;
		display: grid;
		gap: var(--space-2);
	}
	.journey-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-1);
	}
	.kicker {
		font-family: var(--font-mono);
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9fd8d1;
	}
	.skip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 8px 16px;
		border: 1px solid rgb(158 222 214 / 0.55);
		border-radius: var(--radius-pill);
		background: rgb(6 11 22 / 0.6);
		color: #eef4f8;
		font-weight: 600;
		cursor: pointer;
	}
	.skip:hover {
		background: rgb(94 234 212 / 0.14);
	}
	h1 {
		max-width: 18ch;
		margin-top: var(--space-3);
		font-size: clamp(2rem, 1.3rem + 2.6vw, 3.4rem);
		line-height: 1.05;
		letter-spacing: -0.02em;
		color: #ffffff;
	}
	.intro {
		max-width: 58ch;
		color: #c9d6e2;
		font-size: 1.05rem;
	}
	.sentence {
		display: grid;
		gap: var(--space-1);
		max-width: 980px;
		margin-top: var(--space-2);
	}
	.line {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 6px 10px;
		font-size: clamp(1.25rem, 0.95rem + 1.1vw, 1.85rem);
		line-height: 1.6;
		color: #f4f8fb;
	}
	.line.follow {
		font-size: clamp(1.05rem, 0.9rem + 0.6vw, 1.35rem);
		color: #dbe6ee;
	}
	.blank {
		display: inline-flex;
		flex-direction: column;
	}
	.blank-label {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
	.blank select,
	.blank input {
		field-sizing: content;
		min-width: 6ch;
		max-width: 100%;
		min-height: 44px;
		padding: 2px 34px 2px 12px;
		border: 0;
		border-bottom: 2px solid #5eead4;
		border-radius: 8px 8px 2px 2px;
		background: rgb(94 234 212 / 0.1) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%235eead4' stroke-width='2' fill='none'/%3E%3C/svg%3E") no-repeat right 12px center;
		color: #ffffff;
		font: inherit;
		font-weight: 600;
		appearance: none;
		cursor: pointer;
		transition: background-color 0.2s ease, border-color 0.2s ease;
	}
	.blank input {
		padding-right: 12px;
		background-image: none;
		cursor: text;
		min-width: 14ch;
	}
	.blank input::placeholder {
		color: #93a9bb;
		font-weight: 400;
	}
	.blank select.empty {
		color: #a9e9df;
		font-weight: 400;
		font-style: italic;
	}
	.blank select:hover,
	.blank input:hover {
		background-color: rgb(94 234 212 / 0.18);
	}
	.blank select:focus-visible,
	.blank input:focus-visible {
		outline: 2px solid #ffffff;
		outline-offset: 3px;
		background-color: rgb(94 234 212 / 0.22);
	}
	.blank option {
		color: #0f1626;
		background: #ffffff;
		font-style: normal;
	}
	.aside {
		max-width: 70ch;
		font-size: 0.9rem;
		color: #b8c8d6;
	}
	.aside :global(a),
	.preview :global(a) {
		color: #8ff0e1;
	}
	.start-hint {
		margin-top: var(--space-1);
	}
	.preview {
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-3);
		padding: var(--space-3);
		border: 1px solid rgb(158 222 214 / 0.28);
		border-radius: var(--radius-panel);
		background: rgb(8 14 28 / 0.9);
		box-shadow: 0 24px 60px -24px rgb(0 0 0 / 0.7);
	}
	.preview-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}
	.preview h2 {
		font-size: 1.3rem;
		color: #ffffff;
	}
	.preview h3 {
		font-size: 0.95rem;
		margin-bottom: 6px;
		color: #ffffff;
	}
	.status {
		padding: 2px 10px;
		border: 1px solid rgb(251 191 36 / 0.55);
		border-radius: var(--radius-pill);
		color: #fcd98a;
		font-size: 0.8rem;
	}
	.echo {
		font-size: 1.05rem;
		color: #f4f8fb;
	}
	.proposed {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.92rem;
	}
	.proposed th,
	.proposed td {
		padding: 8px 10px;
		border-top: 1px solid rgb(158 222 214 / 0.18);
		text-align: left;
		vertical-align: top;
		color: #dbe6ee;
	}
	.proposed thead th {
		font-family: var(--font-mono);
		font-size: 11.5px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #9fb3c4;
		border-top: 0;
	}
	.proposed tbody th {
		color: #ffffff;
		font-weight: 600;
	}
	.link {
		justify-self: start;
		min-height: 36px;
		padding: 0;
		border: 0;
		background: none;
		color: #8ff0e1;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.technical {
		display: grid;
		gap: 10px;
		padding: var(--space-1) var(--space-2);
		border: 1px solid rgb(158 222 214 / 0.2);
		border-radius: var(--radius-card);
	}
	.limit {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
	}
	.limit label {
		min-width: 16ch;
		color: #dbe6ee;
		font-weight: 600;
	}
	.limit input,
	.limit select {
		width: auto;
		min-height: 40px;
		background: #0f1a2e;
		color: #ffffff;
		border: 1px solid rgb(158 222 214 / 0.35);
	}
	.limit input {
		width: 9rem;
	}
	.preview-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
		gap: var(--space-3);
	}
	.preview ul {
		margin: 0;
		padding-left: 18px;
		display: grid;
		gap: 6px;
		color: #c9d6e2;
		font-size: 0.9rem;
	}
	.changes {
		padding: var(--space-1) var(--space-2);
		border-left: 3px solid #fbbf24;
		background: rgb(251 191 36 / 0.08);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
	}
	.cta {
		min-height: 52px;
		padding: 12px 26px;
		border: 0;
		border-radius: var(--radius-pill);
		background: #5eead4;
		color: #04201c;
		font-size: 1.05rem;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 10px 30px -12px rgb(94 234 212 / 0.7);
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}
	.cta:hover {
		transform: translateY(-1px);
		box-shadow: 0 14px 34px -12px rgb(94 234 212 / 0.85);
	}
	.cta:focus-visible,
	.skip:focus-visible,
	.secondary-action:focus-visible,
	.link:focus-visible {
		outline: 2px solid #ffffff;
		outline-offset: 3px;
	}
	.secondary-action {
		min-height: 44px;
		padding: 8px 16px;
		border: 1px solid rgb(158 222 214 / 0.4);
		border-radius: var(--radius-pill);
		background: transparent;
		color: #dbe6ee;
		font-weight: 600;
		cursor: pointer;
	}

	@media (max-width: 767px) {
		.journey {
			min-height: auto;
			padding-block: var(--space-2) calc(var(--space-6) + 16px);
		}
		h1 {
			margin-top: var(--space-1);
		}
		/* On narrow screens the sentence becomes a sequence of labelled controls. */
		.line {
			display: grid;
			gap: var(--space-1);
			font-size: 1.05rem;
		}
		.connective {
			display: none;
		}
		.blank {
			display: grid;
			gap: 4px;
		}
		.blank-label {
			position: static;
			width: auto;
			height: auto;
			overflow: visible;
			clip: auto;
			white-space: normal;
			font-size: 0.85rem;
			font-weight: 600;
			color: #9fd8d1;
		}
		.blank select,
		.blank input {
			width: 100%;
			field-sizing: fixed;
		}
		.proposed thead {
			display: none;
		}
		.proposed tr {
			display: grid;
			padding: 8px 0;
			border-top: 1px solid rgb(158 222 214 / 0.18);
		}
		.proposed th,
		.proposed td {
			border: 0;
			padding: 2px 0;
		}
		.skip {
			padding-inline: 12px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.cta,
		.blank select {
			transition: none;
		}
	}
</style>
