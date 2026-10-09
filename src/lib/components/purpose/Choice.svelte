<script lang="ts" generics="T extends { id: string; label: string; hint?: string }">
	import { tick, type Snippet } from 'svelte';

	/**
	 * An inline "fill in the blank" choice: a button showing the current value that opens a
	 * single-select listbox (WAI-ARIA select-only combobox pattern, simplified). Keyboard:
	 * arrows, Home/End, type-ahead, Enter/Space to choose, Escape to close.
	 */
	let {
		label,
		value,
		options,
		placeholder,
		onchange,
		icon,
		describedby
	}: {
		/** Question shown as the visible label on narrow screens and as the accessible name. */
		label: string;
		value: string | null;
		options: T[];
		placeholder: string;
		onchange: (id: string) => void;
		icon?: Snippet<[T]>;
		describedby?: string;
	} = $props();

	const uid = $props.id();
	let open = $state(false);
	let active = $state(0);
	let alignRight = $state(false);
	let root: HTMLElement | undefined = $state();
	let button: HTMLButtonElement | undefined = $state();
	let list: HTMLUListElement | undefined = $state();
	let selected = $derived(options.find((option) => option.id === value) ?? null);

	async function show() {
		active = Math.max(0, options.findIndex((option) => option.id === value));
		open = true;
		await tick();
		if (list && root) {
			const right = root.getBoundingClientRect().left + list.offsetWidth;
			alignRight = right > document.documentElement.clientWidth - 12;
		}
		list?.focus({ preventScroll: true });
		scrollActive();
	}
	function hide(returnFocus = true) {
		open = false;
		if (returnFocus) button?.focus();
	}
	function choose(index: number) {
		const option = options[index];
		if (option) onchange(option.id);
		hide();
	}
	function scrollActive() {
		list?.querySelector(`#${CSS.escape(`${uid}-opt-${active}`)}`)?.scrollIntoView({ block: 'nearest' });
	}
	function move(to: number) {
		active = Math.min(options.length - 1, Math.max(0, to));
		scrollActive();
	}
	function onButtonKey(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			show();
		}
	}
	function onListKey(event: KeyboardEvent) {
		const keys: Record<string, () => void> = {
			ArrowDown: () => move(active + 1),
			ArrowUp: () => move(active - 1),
			Home: () => move(0),
			End: () => move(options.length - 1),
			PageDown: () => move(active + 5),
			PageUp: () => move(active - 5),
			Enter: () => choose(active),
			' ': () => choose(active),
			Escape: () => hide()
		};
		const action = keys[event.key];
		if (action) {
			event.preventDefault();
			action();
		} else if (event.key === 'Tab') {
			hide(false);
		} else if (event.key.length === 1 && /\S/.test(event.key)) {
			const letter = event.key.toLowerCase();
			const order = [...options.slice(active + 1), ...options.slice(0, active + 1)];
			const next = order.find((option) => option.label.toLowerCase().startsWith(letter));
			if (next) move(options.indexOf(next));
		}
	}
	function onOutside(event: PointerEvent) {
		if (open && root && !root.contains(event.target as Node)) hide(false);
	}
</script>

<svelte:window onpointerdown={onOutside} />

<span class="choice" class:open bind:this={root}>
	<span class="choice-label" id="{uid}-label">{label}</span>
	<button
		type="button"
		class="choice-button"
		bind:this={button}
		id="{uid}-button"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-controls="{uid}-list"
		aria-labelledby="{uid}-label {uid}-button"
		aria-describedby={describedby}
		onclick={() => (open ? hide() : show())}
		onkeydown={onButtonKey}
	>
		<span class="choice-value" class:placeholder={!selected}>{selected?.label ?? placeholder}</span>
		<svg class="chevron" width="12" height="8" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
	</button>
	{#if open}
		<ul
			class="menu"
			class:align-right={alignRight}
			role="listbox"
			id="{uid}-list"
			tabindex="-1"
			aria-labelledby="{uid}-label"
			aria-activedescendant="{uid}-opt-{active}"
			bind:this={list}
			onkeydown={onListKey}
			onfocusout={(event) => {
				if (!root?.contains(event.relatedTarget as Node | null)) hide(false);
			}}
		>
			{#each options as option, index (option.id)}
				<!-- Keyboard selection is handled on the listbox via aria-activedescendant. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li role="option" id="{uid}-opt-{index}" aria-selected={option.id === value} class:active={index === active} onpointermove={() => (active = index)} onclick={() => choose(index)}>
					{#if icon}<span class="option-icon">{@render icon(option)}</span>{/if}
					<span class="option-text">
						<span class="option-label">{option.label}</span>
						{#if option.hint}<span class="option-hint">{option.hint}</span>{/if}
					</span>
					<svg class="tick" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</li>
			{/each}
		</ul>
	{/if}
</span>

<style>
	.choice {
		position: relative;
		display: inline-block;
		vertical-align: baseline;
	}
	.choice.open {
		z-index: 30;
	}
	.choice-label {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
	.choice-button {
		display: inline-flex;
		align-items: baseline;
		gap: 0.32em;
		margin: 0 -0.18em;
		padding: 0 0.18em;
		border: 0;
		border-radius: 0.22em;
		background: transparent;
		color: var(--pj-ink-strong);
		font: inherit;
		font-weight: 500;
		line-height: inherit;
		text-align: left;
		cursor: pointer;
		transition: background-color 160ms ease;
	}
	.choice-value {
		text-decoration: underline;
		text-decoration-color: var(--pj-accent);
		text-decoration-thickness: 0.07em;
		text-underline-offset: 0.2em;
	}
	.choice-value.placeholder {
		color: var(--pj-placeholder);
		font-weight: 400;
		text-decoration-style: dotted;
		text-decoration-color: color-mix(in srgb, var(--pj-accent) 70%, transparent);
	}
	.chevron {
		flex: none;
		width: 0.42em;
		height: auto;
		align-self: center;
		color: var(--pj-accent);
		transition: transform 160ms ease;
	}
	.open .chevron {
		transform: rotate(180deg);
	}
	.choice-button:hover {
		background: rgb(255 255 255 / 0.06);
	}
	.choice-button:focus-visible {
		outline: 2px solid var(--pj-accent);
		outline-offset: 2px;
	}
	.menu {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 20;
		min-width: 15rem;
		max-width: min(24rem, calc(100vw - 32px));
		max-height: min(26rem, 60vh);
		margin: 0;
		padding: 6px;
		overflow: auto;
		list-style: none;
		border: 1px solid rgb(255 255 255 / 0.1);
		border-radius: 14px;
		background: #0b1424;
		box-shadow:
			0 1px 0 rgb(255 255 255 / 0.04) inset,
			0 28px 60px -18px rgb(0 0 0 / 0.75);
		font-size: 1rem;
		font-weight: 400;
		line-height: 1.35;
		white-space: normal;
		color: var(--pj-ink);
	}
	.menu.align-right {
		left: auto;
		right: 0;
	}
	.menu:focus-visible {
		outline: 2px solid var(--pj-accent);
		outline-offset: 2px;
	}
	[role='option'] {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		padding: 8px 10px;
		border-radius: 9px;
		cursor: pointer;
	}
	[role='option'].active {
		background: rgb(94 234 212 / 0.1);
	}
	.option-icon {
		flex: none;
		display: inline-flex;
		width: 52px;
	}
	.option-text {
		display: grid;
		flex: 1;
		gap: 2px;
	}
	.option-label {
		color: var(--pj-ink-strong);
	}
	.option-hint {
		font-size: 0.82rem;
		color: var(--pj-muted);
	}
	.tick {
		flex: none;
		color: var(--pj-accent);
		visibility: hidden;
	}
	[aria-selected='true'] .tick {
		visibility: visible;
	}
	[aria-selected='true'] .option-label {
		font-weight: 600;
	}

	/* Narrow screens: each blank becomes a labelled, full-width field. */
	@media (max-width: 767px) {
		.choice {
			display: grid;
			gap: 6px;
			width: 100%;
		}
		.choice-label {
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
		.choice-button {
			width: 100%;
			min-height: 48px;
			margin: 0;
			padding: 10px 14px;
			align-items: center;
			border: 1px solid rgb(255 255 255 / 0.14);
			border-radius: 12px;
			background: rgb(255 255 255 / 0.04);
		}
		.choice-value {
			flex: 1;
			text-decoration: none;
		}
		.chevron {
			width: 12px;
		}
		.menu {
			left: 0;
			right: 0;
			min-width: 0;
			max-width: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.choice-button,
		.chevron {
			transition: none;
		}
	}
</style>
