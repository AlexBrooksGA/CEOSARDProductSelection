<script lang="ts">
	import CriteriaPanel from '$lib/components/CriteriaPanel.svelte';
	import ProfilesDialog from '$lib/components/ProfilesDialog.svelte';
	import ResultsList from '$lib/components/ResultsList.svelte';
	import { app } from '$lib/state/app.svelte';

	const store = app();
	let profilesOpen = $state(false);
	let unresolved = $derived(store.explorer.shortlist.filter((id) => !store.productsById[id]));
	// On narrow screens the criteria collapse so results come first; active restrictions stay visible above results.
	let criteriaOpen = $derived(store.isOpen('narrow-criteria', false));
	let activeCount = $derived(Object.keys(store.explorer.criteria).length + (store.explorer.search.trim() ? 1 : 0) + (store.explorer.family !== 'All product families' ? 1 : 0));
</script>

<svelte:head>
	<title>Discover · CEOS-ARD Product Explorer</title>
</svelte:head>

<div class="frame page">
	<header class="page-head">
		<p class="eyebrow">Discover</p>
		<h1>Find CEOS-ARD data products</h1>
		<p class="lede">
			Browse Earth observation data products assessed against a CEOS Analysis Ready Data (CEOS-ARD) Product Family Specification (PFS). Add optional screening criteria, open
			details and evidence, and shortlist candidates to compare. Assessment does not certify suitability for your application.
		</p>
	</header>

	{#if store.urlIssues.length}
		<div class="notice warn" role="status">
			<p><strong>Some link settings could not be used.</strong></p>
			<ul>{#each store.urlIssues as issue (issue)}<li>{issue}</li>{/each}</ul>
		</div>
	{/if}

	<div class="discover">
		<aside class="criteria panel" class:collapsed={!criteriaOpen} aria-label="Search and criteria">
			<button type="button" class="button criteria-toggle" aria-expanded={criteriaOpen} aria-controls="criteria-body" onclick={() => store.setOpen('narrow-criteria', !criteriaOpen)}>
				Search, criteria and profiles{activeCount ? ` (${activeCount} active)` : ''}
			</button>
			<div id="criteria-body" class="criteria-body">
				<CriteriaPanel onopenprofiles={() => (profilesOpen = true)} />
			</div>
		</aside>
		<section class="results-area" aria-labelledby="results-heading">
			<ResultsList />
			<div class="shortlist-bar panel-subtle spread">
				<p>
					<strong>{store.explorer.shortlist.length}</strong> on your shortlist{#if store.explorer.compare.length}, {store.explorer.compare.length} chosen to compare{/if}.
					{#if unresolved.length}<span class="small secondary">{unresolved.length} shortlisted record(s) are not currently loaded.</span>{/if}
				</p>
				<a class="button primary" href={store.href('/shortlist')}>Shortlist &amp; compare</a>
			</div>
		</section>
	</div>
</div>
<ProfilesDialog bind:open={profilesOpen} />

<style>
	.discover {
		display: grid;
		grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
		gap: var(--space-4);
		align-items: start;
	}
	.criteria {
		position: sticky;
		top: calc(var(--nav-height) + 12px);
		max-height: calc(100vh - var(--nav-height) - 24px);
		overflow: auto;
	}
	.results-area {
		display: grid;
		gap: var(--space-3);
		min-width: 0;
	}
	.criteria-toggle {
		display: none;
		width: 100%;
		justify-content: space-between;
	}
	@media (max-width: 960px) {
		.discover {
			grid-template-columns: minmax(0, 1fr);
		}
		.criteria {
			position: static;
			max-height: none;
		}
		.criteria-toggle {
			display: inline-flex;
		}
		.criteria-body {
			margin-top: var(--space-2);
		}
		.collapsed .criteria-body {
			display: none;
		}
	}
	ul {
		margin: 0;
		padding-left: 18px;
	}
</style>
