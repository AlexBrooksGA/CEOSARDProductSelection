<script lang="ts">
	import type { Tip } from './chart';
	let { tip }: { tip: Tip | null } = $props();
</script>

{#if tip}
	<div class="cq-tip" role="status" style:left="{tip.x}%" style:top="{tip.y}%">
		<strong>{tip.title}</strong>
		{#each tip.lines as line (line)}<span>{line}</span>{/each}
		{#if tip.note}<span class="cq-tip-note">{tip.note}</span>{/if}
	</div>
{/if}
