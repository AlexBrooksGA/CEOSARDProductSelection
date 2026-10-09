<script lang="ts">
	import { activeCriteria, describeCriterion } from '$lib/domain/criteria';
	import { familyLabel } from '$lib/domain/guidance';
	import { customInputFromProfile, customInputFromState, newCustomProfileId, previewProfile, profileSettings, SCOPE_LABELS, type ProfilePreview } from '$lib/domain/profiles';
	import type { Profile } from '$lib/domain/types';
	import { app } from '$lib/state/app.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();
	const store = app();
	let dialog: HTMLDialogElement | undefined = $state();
	let previewing = $state<{ profile: Profile; preview: ProfilePreview } | null>(null);
	let editingId = $state<string | null>(null);
	let name = $state('');
	let description = $state('');
	let replaceCriteria = $state(false);
	let error = $state<string | null>(null);
	let confirmDelete = $state<string | null>(null);

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			const draft = store.session.profileDraft;
			if (draft && !name && !description) {
				editingId = draft.editingId;
				name = draft.name;
				description = draft.description;
			}
		} else if (!open && dialog.open) dialog.close();
	});

	function summary(profile: Profile): string[] {
		const settings = profileSettings(profile);
		const lines = [`Family: ${familyLabel(settings.family)}`, `Scope: ${SCOPE_LABELS[settings.scope]}`];
		const criteria = activeCriteria(settings.criteria);
		lines.push(...(criteria.length ? criteria.map(([n, s]) => describeCriterion(n, s)) : ['No screening criteria']));
		return lines;
	}

	function preview(profile: Profile) {
		previewing = { profile, preview: previewProfile(store.explorer, profile) };
		queueMicrotask(() => document.getElementById('profile-preview-heading')?.focus());
	}

	async function apply() {
		if (!previewing) return;
		const profile = previewing.profile;
		previewing = null;
		open = false;
		await store.applyProfile(profile);
	}

	function persistDraft() {
		store.updateSession((s) => void (s.profileDraft = { editingId, name, description }));
	}

	function startEdit(profile: Profile) {
		editingId = profile.id;
		name = profile.name;
		description = profile.description;
		replaceCriteria = false;
		error = null;
		persistDraft();
		queueMicrotask(() => document.getElementById('profile-name')?.focus());
	}

	function resetForm() {
		editingId = null;
		name = '';
		description = '';
		replaceCriteria = false;
		error = null;
		store.updateSession((s) => void (s.profileDraft = null));
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		const existing = editingId ? store.customProfiles.find((p) => p.id === editingId) : undefined;
		const base = existing && !replaceCriteria ? customInputFromProfile(existing) : customInputFromState(store.explorer, existing?.id ?? newCustomProfileId());
		const result = store.saveCustomProfile({ ...base, name, description });
		if (!result.ok) {
			// The draft is kept so nothing typed is lost.
			error = result.error;
			persistDraft();
			queueMicrotask(() => document.getElementById('profile-name')?.focus());
			return;
		}
		resetForm();
	}

	function saveChangesToActive() {
		const active = store.activeProfile;
		if (!active || active.built_in) return;
		store.saveCustomProfile({ ...customInputFromState(store.explorer, active.id), name: active.name, description: active.description });
	}
</script>

<dialog bind:this={dialog} class="profiles-dialog" aria-labelledby="profiles-title" onclose={() => (open = false)}>
	<div class="dialog-head spread">
		<h2 id="profiles-title">Profiles</h2>
		<button type="button" class="button small" onclick={() => (open = false)}>Close</button>
	</div>

	{#if previewing}
		<section class="preview stack" aria-labelledby="profile-preview-heading">
			<h3 id="profile-preview-heading" tabindex="-1">Apply “{previewing.profile.name}”?</h3>
			{#if previewing.preview.changes.length}
				<table class="changes">
					<caption class="visually-hidden">Settings this profile replaces</caption>
					<thead><tr><th scope="col">Setting</th><th scope="col">Now</th><th scope="col">After applying</th></tr></thead>
					<tbody>
						{#each previewing.preview.changes as change (change.label)}
							<tr><th scope="row">{change.label}</th><td>{change.from}</td><td>{change.to}</td></tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p>The current settings already match this profile.</p>
			{/if}
			<p class="small"><strong>Kept as they are:</strong> {previewing.preview.retained.length ? previewing.preview.retained.join('; ') : 'no other constraints are active'}. Your shortlist and notes are never changed.</p>
			<div class="row">
				<button type="button" class="button primary" onclick={apply}>Apply profile</button>
				<button type="button" class="button" onclick={() => (previewing = null)}>Cancel</button>
			</div>
			<p class="hint">You can undo after applying.</p>
		</section>
	{:else}
		<section class="stack" aria-labelledby="builtin-heading">
			<h3 id="builtin-heading">Illustrative starting points</h3>
			<p class="hint">Built-in profiles set a family, scope and screening criteria you can then edit. They are not official CEOS requirements and do not establish suitability.</p>
			<ul class="profile-list">
				{#each store.builtInProfiles as profile (profile.id)}
					<li class="profile-item">
						<div>
							<strong>{profile.name}</strong>{#if store.activeProfile?.id === profile.id}<span class="badge info">Applied{store.activeProfileModified ? ' · Modified' : ''}</span>{/if}
							<p class="small secondary">{profile.description}</p>
							<ul class="settings small">{#each summary(profile) as line (line)}<li>{line}</li>{/each}</ul>
							{#if profile.assumptions}<p class="hint">{profile.assumptions}</p>{/if}
						</div>
						<button type="button" class="button small" onclick={() => preview(profile)}>Preview<span class="visually-hidden"> {profile.name}</span></button>
					</li>
				{/each}
			</ul>
		</section>

		<section class="stack" aria-labelledby="custom-heading">
			<h3 id="custom-heading">My profiles</h3>
			<p class="hint">Saved in this browser tab’s session only — they are lost when the session ends and are not included in shared links (links carry the resolved criteria instead).</p>
			{#if store.customProfiles.length}
				<ul class="profile-list">
					{#each store.customProfiles as profile (profile.id)}
						<li class="profile-item">
							<div>
								<strong>{profile.name}</strong>{#if store.activeProfile?.id === profile.id}<span class="badge info">Applied{store.activeProfileModified ? ' · Modified' : ''}</span>{/if}
								<p class="small secondary">{profile.description}</p>
								<ul class="settings small">{#each summary(profile) as line (line)}<li>{line}</li>{/each}</ul>
							</div>
							<div class="row">
								<button type="button" class="button small" onclick={() => preview(profile)}>Preview<span class="visually-hidden"> {profile.name}</span></button>
								<button type="button" class="button small" onclick={() => startEdit(profile)}>Edit<span class="visually-hidden"> {profile.name}</span></button>
								{#if confirmDelete === profile.id}
									<button type="button" class="button small" onclick={() => { store.deleteCustomProfile(profile.id); confirmDelete = null; if (editingId === profile.id) resetForm(); }}>Confirm delete</button>
									<button type="button" class="button small plain" onclick={() => (confirmDelete = null)}>Keep</button>
								{:else}
									<button type="button" class="button small plain" onclick={() => (confirmDelete = profile.id)}>Delete<span class="visually-hidden"> {profile.name}</span></button>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="small secondary">No session profiles yet.</p>
			{/if}
			{#if store.activeProfile && !store.activeProfile.built_in && store.activeProfileModified}
				<button type="button" class="button" onclick={saveChangesToActive}>Save current criteria to “{store.activeProfile.name}”</button>
			{/if}

			<form class="stack profile-form" onsubmit={save} novalidate>
				<h4>{editingId ? 'Edit profile' : 'Save current criteria as a profile'}</h4>
				<div class="field">
					<label for="profile-name">Profile name</label>
					<input id="profile-name" type="text" bind:value={name} oninput={persistDraft} maxlength="160" aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'profile-error' : 'profile-name-hint'} />
					<p id="profile-name-hint" class="hint">At least three characters; must differ from other profile names.</p>
					{#if error}<p id="profile-error" class="error-text" role="alert">{error}</p>{/if}
				</div>
				<div class="field">
					<label for="profile-description">Short description (optional)</label>
					<input id="profile-description" type="text" bind:value={description} oninput={persistDraft} maxlength="280" />
				</div>
				{#if editingId}
					<label class="check"><input type="checkbox" bind:checked={replaceCriteria} />Also replace its settings with the current family, scope and criteria</label>
				{:else}
					<p class="hint">Saves the current family, scope, unreported-value setting and criteria.</p>
				{/if}
				<div class="row">
					<button type="submit" class="button primary">{editingId ? 'Save changes' : 'Save profile'}</button>
					{#if editingId || name || description}<button type="button" class="button plain" onclick={resetForm}>Cancel</button>{/if}
				</div>
			</form>
		</section>
	{/if}
</dialog>

<style>
	.profiles-dialog {
		width: min(100% - 24px, 760px);
		max-height: min(100% - 24px, 900px);
		padding: var(--space-3);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-panel);
		background: var(--panel);
		color: var(--text);
	}
	.profiles-dialog::backdrop {
		background: rgb(8 13 24 / 0.55);
	}
	.dialog-head {
		margin-bottom: var(--space-2);
	}
	.profiles-dialog section + section {
		margin-top: var(--space-4);
	}
	.profile-list {
		display: grid;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.profile-item {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 10px;
		padding: var(--space-1);
		border: 1px solid var(--line);
		border-radius: var(--radius-card);
	}
	.profile-item > div:first-child {
		flex: 1 1 320px;
	}
	.profile-item .badge {
		margin-left: 8px;
	}
	.settings {
		margin: 6px 0 0;
		padding-left: 18px;
		color: var(--text-secondary);
	}
	.changes {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	.changes th,
	.changes td {
		padding: 6px 8px;
		border-bottom: 1px solid var(--line);
		text-align: left;
		vertical-align: top;
	}
	.profile-form {
		padding: var(--space-2);
		border: 1px solid var(--line);
		border-radius: var(--radius-card);
		background: var(--panel-subtle);
	}
	.error-text {
		color: var(--danger-fg);
		font-size: 0.875rem;
		font-weight: 600;
	}
	#profile-preview-heading:focus {
		outline: none;
	}
</style>
