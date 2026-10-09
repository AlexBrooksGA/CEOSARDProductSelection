<script lang="ts">
	import { CRITERION_BY_NAME, formatNumber, MODE_LABELS } from '$lib/domain/criteria';
	import type { CriterionMode, CriterionName } from '$lib/domain/types';

	interface Props {
		name: CriterionName;
		mode: CriterionMode;
		value: number | string;
		onchange: (mode: CriterionMode, value: number | string) => void;
		onremove: () => void;
	}
	let { name, mode, value, onchange, onremove }: Props = $props();
	let definition = $derived(CRITERION_BY_NAME[name]);
	let id = $derived(`criterion-${name}`);
	// Derived from the committed value; temporarily overridden while the user types.
	let text = $derived(definition.kind === 'number' ? formatNumber(Number(value)) : String(value));
	let error = $state<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let showHelp = $state(false);

	function commitNumber(raw: string, immediate = false) {
		if (definition.kind !== 'number') return;
		clearTimeout(timer);
		// Wait for the user to finish an intermediate entry such as "10." before committing.
		if (!immediate && /\.$/.test(raw.trim())) return;
		const parsed = Number(raw.trim());
		if (!raw.trim() || !Number.isFinite(parsed)) {
			error = `Enter a number in ${definition.unit}.`;
			return;
		}
		if (parsed < definition.min || parsed > definition.max) {
			error = `Enter a value from ${formatNumber(definition.min)} to ${formatNumber(definition.max)} ${definition.unit}.`;
			return;
		}
		if (definition.integer && !Number.isInteger(parsed)) {
			error = 'Enter a whole number.';
			return;
		}
		error = null;
		const apply = () => onchange(mode, parsed);
		if (immediate) apply();
		else timer = setTimeout(apply, 450);
	}
</script>

<fieldset class="criterion" aria-describedby="{id}-help">
	<legend class="criterion-legend">
		<span>{definition.label}</span>
		<button type="button" class="button plain small" aria-expanded={showHelp} aria-controls="{id}-help" onclick={() => (showHelp = !showHelp)}>Explain this term</button>
	</legend>
	<p id="{id}-help" class="hint" hidden={!showHelp}>{definition.help}</p>

	<div class="criterion-value">
		{#if definition.kind === 'number'}
			<label for="{id}-value" class="visually-hidden">{definition.label} limit in {definition.unit}</label>
			<span class="comparator" aria-hidden="true">{definition.comparator}</span>
			<input
				id="{id}-value"
				type="text"
				inputmode="decimal"
				autocomplete="off"
				list="{id}-presets"
				value={text}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? `${id}-error` : undefined}
				oninput={(event) => {
					text = event.currentTarget.value;
					commitNumber(text);
				}}
				onchange={(event) => commitNumber(event.currentTarget.value, true)}
			/>
			<span class="unit">{definition.unit}</span>
			<datalist id="{id}-presets">
				{#each definition.presets as preset (preset)}<option value={formatNumber(preset)}></option>{/each}
			</datalist>
		{:else}
			<label for="{id}-value" class="visually-hidden">{definition.label}: minimum reported scope</label>
			<select id="{id}-value" value={String(value)} onchange={(event) => onchange(mode, event.currentTarget.value)}>
				{#each definition.options as option (option)}<option value={option}>{option} or broader</option>{/each}
			</select>
		{/if}
	</div>
	{#if error}<p id="{id}-error" class="error small" role="alert">{error}</p>{/if}

	<div class="criterion-mode">
		<div class="segmented" role="radiogroup" aria-label="{definition.label} importance">
			{#each ['required', 'preferred', 'not_used'] as option (option)}
				<label>
					<input type="radio" name="{id}-mode" value={option} checked={mode === option} onchange={() => onchange(option as CriterionMode, value)} />
					<span>{MODE_LABELS[option as CriterionMode]}</span>
				</label>
			{/each}
		</div>
		<button type="button" class="button plain small" onclick={onremove}>Remove<span class="visually-hidden"> {definition.label} criterion</span></button>
	</div>
	{#if mode === 'not_used'}<p class="hint">Ignored: kept here but not used for screening.</p>{/if}
</fieldset>

<style>
	.criterion {
		display: grid;
		gap: 8px;
		padding: var(--space-1);
		border: 1px solid var(--line);
		border-radius: var(--radius-card);
		background: var(--panel);
	}
	.criterion-legend {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
		padding: 0;
		font-weight: 600;
		font-size: 0.92rem;
		float: left;
	}
	.criterion-legend + * {
		clear: both;
	}
	.criterion-value {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.criterion-value input {
		max-width: 9rem;
		font-family: var(--font-mono);
	}
	.comparator,
	.unit {
		font-family: var(--font-mono);
		color: var(--text-secondary);
	}
	.criterion-mode {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
	}
	.error {
		color: var(--danger-fg);
	}
</style>
