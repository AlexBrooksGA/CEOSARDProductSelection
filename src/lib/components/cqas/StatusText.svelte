<script lang="ts">
	import type { FindingStatus } from '$lib/domain/cqas';
	import { STATUS_META } from './chart';
	let { status, prefix = '' }: { status: FindingStatus; prefix?: string } = $props();
	let meta = $derived(STATUS_META[status]);
</script>

<span class="cq-st {meta.cls}"><span class="cq-ico" aria-hidden="true">{meta.icon}</span>{prefix}{meta.label}</span>

<style>
	.cq-ico {
		margin-right: 0.3em;
		font-style: normal;
	}
</style>
