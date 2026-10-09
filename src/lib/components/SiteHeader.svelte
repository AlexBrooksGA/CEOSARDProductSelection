<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { app } from '$lib/state/app.svelte';
	import GlossaryDialog from './GlossaryDialog.svelte';

	const store = app();
	let glossaryOpen = $state(false);
	let path = $derived(page.url.pathname);
	let dark = $state(false);
	onMount(() => {
		const explicit = document.documentElement.dataset.theme;
		dark = explicit ? explicit === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
	});
	function toggleTheme() {
		dark = !dark;
		store.setTheme(dark ? 'dark' : 'light');
	}
</script>

<header class="site-header">
	<div class="frame header-inner">
		<a class="brand" href={store.href('/')}>
			<span class="brand-mark" aria-hidden="true"></span>
			<span>CEOS-ARD Product Explorer</span>
			<span class="prototype mono">Prototype</span>
		</a>
		<nav aria-label="Main">
			<ul>
				<li><a href={store.href('/')} aria-current={path === '/' || path.startsWith('/products') ? 'page' : undefined}>Discover</a></li>
				<li>
					<a href={store.href('/shortlist')} aria-current={path === '/shortlist' ? 'page' : undefined}>
						Shortlist &amp; compare <span class="count mono">({store.explorer.shortlist.length})</span>
					</a>
				</li>
			</ul>
		</nav>
		<div class="utilities">
			<button type="button" class="button small plain" onclick={() => (glossaryOpen = true)}>Glossary</button>
			<button type="button" class="button small" aria-pressed={dark} onclick={toggleTheme}><span aria-hidden="true">◐</span> Dark theme</button>
		</div>
	</div>
</header>
<GlossaryDialog bind:open={glossaryOpen} />

<style>
	.site-header {
		position: sticky;
		top: 0;
		z-index: 20;
		background: var(--nav);
		border-bottom: 1px solid var(--line);
	}
	.header-inner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px var(--space-3);
		min-height: var(--nav-height);
		padding-block: 6px;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}
	.brand-mark {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 2px solid var(--accent);
		box-shadow: inset -6px -3px 0 -2px var(--accent);
	}
	.prototype {
		padding: 1px 8px;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-pill);
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}
	nav ul {
		display: flex;
		gap: 4px 18px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	nav a {
		display: inline-flex;
		align-items: center;
		min-height: 40px;
		gap: 4px;
		color: var(--text-secondary);
		font-weight: 600;
		text-decoration: none;
		border-bottom: 2px solid transparent;
	}
	nav a:hover {
		color: var(--text);
	}
	nav a[aria-current='page'] {
		color: var(--accent-text);
		border-bottom-color: var(--accent);
	}
	.count {
		font-size: 0.85rem;
	}
	.utilities {
		display: flex;
		gap: 6px;
		margin-left: auto;
	}
	@media (max-width: 767px) {
		.site-header {
			position: static;
		}
		.utilities {
			margin-left: 0;
		}
	}
</style>
