<script lang="ts">
	import { familyVisual } from '$lib/domain/guidance';
	let { family }: { family: string | null } = $props();
	let visual = $derived(familyVisual(family));
</script>

<span class="family-mark cat-{visual.slug}"><span class="family-icon" aria-hidden="true">{visual.icon}</span><span>{visual.label}</span></span>
