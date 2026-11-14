<script lang="ts">
	import type { Tip } from './chart';
	let { tip }: { tip: Tip | null } = $props();
</script>

{#if tip}
	<!-- Visual only: the focused element's label or value text carries the same information. -->
	<div class="cq-tip" aria-hidden="true" style:left="clamp(min(130px, 50%), {tip.x}%, max(calc(100% - 130px), 50%))" style:top="{tip.y}%">
		<strong>{tip.title}</strong>
		{#each tip.lines as line (line)}<span>{line}</span>{/each}
		{#if tip.note}<span class="cq-tip-note">{tip.note}</span>{/if}
	</div>
{/if}
