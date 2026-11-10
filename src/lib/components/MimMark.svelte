<script lang="ts">
	/** Purple asterisk marking a value that comes from the CEOS MIM database. */
	let { label = 'From the CEOS MIM database' }: { label?: string } = $props();
</script>

<span class="mim-mark" title={label}><span aria-hidden="true">*</span><span class="visually-hidden"> ({label})</span></span>
