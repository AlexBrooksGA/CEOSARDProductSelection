<script lang="ts">
	/**
	 * Purple asterisk marking a value that comes from the CEOS MIM database.
	 * `decorative`: inside a section that already says, in text, that all its values are from MIM,
	 * so screen readers are not told again for every value.
	 */
	let { label = 'From the CEOS MIM database', decorative = false }: { label?: string; decorative?: boolean } = $props();
</script>

{#if decorative}
	<span class="mim-mark" aria-hidden="true">*</span>
{:else}
	<span class="mim-mark" title={label}><span aria-hidden="true">*</span><span class="visually-hidden"> ({label})</span></span>
{/if}
