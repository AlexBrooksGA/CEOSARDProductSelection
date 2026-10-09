<script lang="ts">
	import '@fontsource/space-grotesk/400.css';
	import '@fontsource/space-grotesk/600.css';
	import '@fontsource/space-mono/400.css';
	import '@fontsource/space-mono/700.css';
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import { AppStore, setAppStore } from '$lib/state/app.svelte';

	let { data, children } = $props();
	// One store per app instance (per browser tab, or per request during SSR) — never server-global.
	// The bundled layout data does not change during the life of the page.
	// svelte-ignore state_referenced_locally
	const store = setAppStore(new AppStore(data));

	onMount(() => {
		void store.hydrate().then(() => (document.body.dataset.hydrated = 'true'));
	});
	// Remember the latest explicit public state for same-session restoration.
	$effect(() => {
		void page.url.search;
		store.rememberQuery();
	});
</script>

<svelte:head>
	<title>CEOS-ARD Product Explorer</title>
</svelte:head>

<a class="skip-link" href="#main">Skip to main content</a>
<SiteHeader />
<main id="main" tabindex="-1">
	{#if store.sessionIssues.length}
		<div class="frame session-issues">
			{#each store.sessionIssues as issue (issue)}<p class="notice warn">{issue}</p>{/each}
		</div>
	{/if}
	{@render children()}
</main>
<footer class="site-footer">
	<div class="frame small secondary stack-tight">
		<p>
			This explorer supports dataset discovery, shortlisting and comparison. A CEOS-ARD assessment describes conformance with a Product Family Specification; it does not certify
			suitability for a particular application or recommend one provider over another. Built-in profiles are illustrative starting points, not official CEOS requirements.
		</p>
		<p>
			Curated catalogue: {store.curated.length} records{store.catalogueSource === 'demo-fallback' ? ' (demonstration fallback data)' : ''}. Profiles, notes and drafts are kept only in this browser tab's session.
			The explorer does not download or validate imagery.
		</p>
	</div>
</footer>
<div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{store.announcement}</div>

<style>
	main:focus {
		outline: none;
	}
	.session-issues {
		padding-top: var(--space-2);
		display: grid;
		gap: 8px;
	}
	.site-footer {
		border-top: 1px solid var(--line);
		background: var(--nav);
		padding-block: var(--space-3);
	}
</style>
