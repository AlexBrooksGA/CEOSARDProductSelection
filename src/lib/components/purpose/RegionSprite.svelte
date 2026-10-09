<script lang="ts">
	import shapes from './region-shapes.json';

	/** Shared shapes for the region icons, rendered once while the purpose entry is open. */
	const viewBox = `0 0 ${shapes.width} ${shapes.height}`;
	const regions = ['AF', 'AS', 'EU', 'NA', 'SA', 'OC'] as const;
</script>

<svg width="0" height="0" class="sprite" aria-hidden="true" focusable="false">
	<symbol id="pj-world" {viewBox}><path d={shapes.world} /></symbol>
	{#each regions as key (key)}<symbol id="pj-region-{key}" {viewBox}><path d={shapes[key]} /></symbol>{/each}
	<symbol id="pj-polar" {viewBox}>
		<circle cx={shapes.polarDisc.cx} cy={shapes.polarDisc.cy} r={shapes.polarDisc.r} fill="none" stroke="currentColor" stroke-width="1.2" />
		<path d={shapes.polarLand} />
	</symbol>
	<symbol id="pj-region-AN" {viewBox}><path d={shapes.AN} /></symbol>
</svg>

<style>
	.sprite {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
	}
</style>
