<script lang="ts">
	import { mimEditionText, type MimSource } from '$lib/domain/mim';
	import ExternalLink from './ExternalLink.svelte';

	/** Legend for the purple asterisk, with the attribution the CC BY 4.0 licence requires. */
	let { source }: { source: MimSource } = $props();
	let edition = $derived(mimEditionText(source));
</script>

<p class="small secondary mim-footnote">
	<span class="mim-mark" aria-hidden="true">*</span>
	From the CEOS Missions, Instruments and Measurements (MIM) database: {source.attribution}{edition ? `, ${edition}` : ''}.
	Licence: {#if source.licence.url}<ExternalLink href={source.licence.url}>{source.licence.name}</ExternalLink>{:else}{source.licence.name}{/if}.
	Shown for context; MIM values are declared by agencies, are not part of the CEOS-ARD assessment and never change results.
</p>

<style>
	.mim-footnote {
		margin: 0;
	}
	.mim-footnote .mim-mark {
		margin: 0 2px 0 0;
		font-size: 1.1em;
	}
</style>
