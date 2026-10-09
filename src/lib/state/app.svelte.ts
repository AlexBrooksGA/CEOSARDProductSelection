/**
 * Per-browser-tab client store. Created once per app instance in the root layout and
 * shared through context, so no shortlist/profile state is ever held server-globally.
 *
 * Public state lives in the URL (source of truth, see url.ts); private state lives in the
 * session adapter (session.ts). Components consume derived domain results from here and
 * never implement their own matching rules.
 */
import { getContext, setContext } from 'svelte';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { deduplicateProducts } from '$lib/domain/catalogue';
import { criteriaFingerprint } from '$lib/domain/criteria';
import { clearCriteria, matchingCriteria, toFilterState, type ExplorerState } from '$lib/domain/explorer';
import { MIM_SOURCE_TYPE } from '$lib/domain/facts';
import { exclusions, metadataFilter, type Exclusion } from '$lib/domain/filters';
import { groupAndSort } from '$lib/domain/matching';
import { presentResults, presentResult, type PresentedResult } from '$lib/domain/presentation';
import { buildCustomProfile, customInputFromState, newCustomProfileId, previewProfile, profileModified, profileNameError, type CustomProfileInput } from '$lib/domain/profiles';
import { addToCompare, addToShortlist, removeFromCompare, removeFromShortlist, type Selection } from '$lib/domain/selection';
import type { ProductNote } from '$lib/domain/summary';
import type { Product, Profile, ProvenanceRow } from '$lib/domain/types';
import { browserStorage, createSessionAdapter, emptySession, type SessionAdapter, type SessionData } from './session';
import { parseUrlState, queryString } from './url';

export interface MimStatusView {
	configured: boolean;
	state: 'not_configured' | 'not_loaded' | 'loading' | 'ready' | 'stale' | 'error';
	message: string;
	errorKind: string | null;
	productCount: number;
	fetchedAt: string | null;
	expiresAt: string | null;
	retryAfterSeconds: number | null;
	endpoints: { products: string; instruments: string } | null;
	ttlHours: number;
}

export interface LayoutPayload {
	products: Product[];
	profiles: Profile[];
	agencyMarks: Record<string, { url: string; monochrome: boolean }>;
	notFound: Record<string, Record<string, string>>;
	catalogueSource: 'researched' | 'demo-fallback';
	mim: MimStatusView;
}

export type History = 'push' | 'replace';

const KEY = Symbol('ceos-ard-app');

export class AppStore {
	// Bundled data is fixed for the life of the page; `$state.raw` keeps it cheap and lets the
	// derived values below be declared as class fields.
	curated = $state.raw<Product[]>([]);
	builtInProfiles = $state.raw<Profile[]>([]);
	agencyMarks = $state.raw<LayoutPayload['agencyMarks']>({});
	catalogueSource = $state.raw<LayoutPayload['catalogueSource']>('researched');
	notFound = $state.raw<LayoutPayload['notFound']>({});

	session = $state<SessionData>(emptySession());
	sessionIssues = $state<string[]>([]);
	persistent = $state(true);
	hydrated = $state(false);
	mimStatus = $state<MimStatusView>() as MimStatusView;
	mimProducts = $state<Product[]>([]);
	mimBusy = $state(false);
	announcement = $state('');
	undo = $state<{ query: string; label: string; path: string } | null>(null);
	provenanceCache = $state<Record<string, Record<string, ProvenanceRow>>>({});

	private adapter: SessionAdapter = createSessionAdapter(null);

	constructor(payload: LayoutPayload) {
		this.curated = payload.products;
		this.builtInProfiles = payload.profiles;
		this.agencyMarks = payload.agencyMarks;
		this.catalogueSource = payload.catalogueSource;
		this.notFound = payload.notFound;
		this.mimStatus = payload.mim;
	}

	// ------------------------------------------------------------ public URL state
	parsed = $derived(parseUrlState(page.url.searchParams));
	explorer = $derived(this.parsed.state);
	urlIssues = $derived(this.parsed.issues);

	/** Navigate to a new public state. `replace` for ongoing edits, `push` for deliberate actions. */
	async setExplorer(next: ExplorerState, history: History = 'replace', path = page.url.pathname): Promise<void> {
		const query = queryString(next);
		const target = `${path}?${query}`;
		if (target === `${page.url.pathname}${page.url.search}`) return;
		await goto(target, { replaceState: history === 'replace', keepFocus: true, noScroll: true });
	}

	patch(mutator: (draft: ExplorerState) => void, history: History = 'replace'): Promise<void> {
		const draft = structuredClone($state.snapshot(this.explorer)) as ExplorerState;
		mutator(draft);
		return this.setExplorer(draft, history);
	}

	/** Query string for internal links so navigation never loses context. */
	query = $derived(queryString(this.explorer));
	href(path: string): string {
		return `${path}?${this.query}`;
	}

	// ------------------------------------------------------------ derived domain results
	allProducts = $derived(deduplicateProducts([...this.curated, ...this.mimProducts]));
	productsById = $derived(Object.fromEntries(this.allProducts.map((product) => [product.id, product])) as Record<string, Product>);
	mimLoaded = $derived(this.mimProducts.length > 0);
	available = $derived(this.explorer.includeMim ? this.allProducts : this.curated);
	criteria = $derived(matchingCriteria(this.explorer));
	fingerprint = $derived(criteriaFingerprint(this.explorer.criteria));
	filterState = $derived(toFilterState(this.explorer));
	filtered = $derived(metadataFilter(this.available, this.filterState));
	grouped = $derived(groupAndSort(this.filtered, { criteria: this.criteria }));
	presented = $derived(presentResults(this.grouped, this.criteria));
	presentedById = $derived(
		Object.fromEntries(this.presented.sections.flatMap((section) => section.items.map((item) => [item.result.product.id, { item, section: section.key }]))) as Record<string, { item: PresentedResult; section: string }>
	);
	mimHiddenByFilters = $derived(this.explorer.includeMim ? this.mimProducts.filter((product) => !this.filtered.includes(product)).length : 0);
	providers = $derived([...new Set(this.available.map((p) => p.provider).filter((p): p is string => Boolean(p)))].sort());
	operationalStatuses = $derived([...new Set(this.available.map((p) => p.operational_status).filter((p): p is string => Boolean(p)))].sort());
	sourceTypes = $derived([...new Set(this.available.map((p) => p.source_type))].sort());

	/** Present any product (even outside current results) against the current criteria. */
	presentProduct(product: Product): PresentedResult {
		const existing = this.presentedById[product.id];
		if (existing) return existing.item;
		const result = Object.values(groupAndSort([product], { criteria: this.criteria })).flat()[0]!;
		return presentResult(result, this.criteria);
	}

	/** Why a shortlisted product is outside the current results (or null when it is shown). */
	outsideReasons(product: Product): Exclusion[] | null {
		if (this.filtered.includes(product)) return null;
		const reasons = exclusions(product, this.filterState);
		if (!this.explorer.includeMim && product.source_type === MIM_SOURCE_TYPE) {
			reasons.unshift({ kind: 'source', reason: 'MIM records are not included in the current results.' });
		}
		return reasons;
	}

	unresolvedReason(id: string): string {
		if (id.startsWith('mim-product:')) {
			if (!this.mimStatus.configured) return 'MIM record — MIM is not configured for this deployment.';
			if (!this.mimLoaded) return 'MIM record — MIM products are not loaded in this session.';
			return 'MIM record — not present in the currently loaded MIM data.';
		}
		return 'Not found in the current catalogue (it may have been removed or renamed).';
	}

	// ------------------------------------------------------------ profiles
	customProfiles = $derived(this.session.customProfiles);
	allProfiles = $derived([...this.builtInProfiles, ...this.customProfiles]);
	activeProfile = $derived(
		(this.explorer.profileId && this.builtInProfiles.find((p) => p.id === this.explorer.profileId)) ||
			(this.session.appliedCustomProfileId && this.customProfiles.find((p) => p.id === this.session.appliedCustomProfileId)) ||
			null
	);
	activeProfileModified = $derived(this.activeProfile ? profileModified(this.explorer, this.activeProfile) : false);

	async applyProfile(profile: Profile): Promise<void> {
		const before = this.query;
		const { next } = previewProfile(this.explorer, profile);
		if (!profile.built_in) next.profileId = null;
		this.updateSession((s) => {
			s.appliedCustomProfileId = profile.built_in ? null : profile.id;
		});
		this.undo = { query: before, label: `Applied “${profile.name}”`, path: page.url.pathname };
		await this.setExplorer(next, 'push');
		this.announce(`Applied the profile ${profile.name}. Undo is available.`);
	}

	async restoreProfileDefaults(): Promise<void> {
		if (this.activeProfile) await this.applyProfile(this.activeProfile);
	}

	async clearCriteria(): Promise<void> {
		const before = this.query;
		this.undo = { query: before, label: 'Cleared criteria', path: page.url.pathname };
		this.updateSession((s) => {
			s.appliedCustomProfileId = null;
		});
		await this.setExplorer(clearCriteria(this.explorer), 'push');
		this.announce('Cleared search, family and technical criteria. The catalogue scope and your shortlist are unchanged. Undo is available.');
	}

	async undoLast(): Promise<void> {
		if (!this.undo) return;
		const { query, label, path } = this.undo;
		this.undo = null;
		await goto(`${path}?${query}`, { keepFocus: true, noScroll: true });
		this.announce(`Undid: ${label}.`);
	}

	saveCustomProfile(input: CustomProfileInput): { ok: true; profile: Profile } | { ok: false; error: string } {
		const error = profileNameError(input.name.replace(/\s+/g, ' ').trim(), this.allProfiles, input.id);
		if (error) return { ok: false, error };
		const profile = buildCustomProfile(input);
		this.updateSession((s) => {
			const index = s.customProfiles.findIndex((p) => p.id === profile.id);
			if (index >= 0) s.customProfiles[index] = profile;
			else s.customProfiles.push(profile);
			s.profileDraft = null;
		});
		this.announce(`Saved the session profile ${profile.name}.`);
		return { ok: true, profile };
	}

	newProfileInput(): CustomProfileInput {
		return customInputFromState(this.explorer, newCustomProfileId());
	}

	deleteCustomProfile(id: string): void {
		const profile = this.customProfiles.find((p) => p.id === id);
		this.updateSession((s) => {
			s.customProfiles = s.customProfiles.filter((p) => p.id !== id);
			if (s.appliedCustomProfileId === id) s.appliedCustomProfileId = null;
		});
		if (profile) this.announce(`Deleted the session profile ${profile.name}. Current criteria were not changed.`);
	}

	// ------------------------------------------------------------ shortlist and comparison
	selection = $derived<Selection>({ shortlist: this.explorer.shortlist, compare: this.explorer.compare });

	private async applySelection(outcome: { ok: boolean; selection: Selection; message: string }): Promise<boolean> {
		if (outcome.ok) {
			await this.patch((draft) => {
				draft.shortlist = outcome.selection.shortlist;
				draft.compare = outcome.selection.compare;
			});
		}
		this.announce(outcome.message);
		return outcome.ok;
	}

	toggleShortlist(id: string): Promise<boolean> {
		if (this.explorer.shortlist.includes(id)) {
			return this.applySelection({ ok: true, selection: removeFromShortlist(this.selection, id), message: 'Removed from the shortlist.' });
		}
		return this.applySelection(addToShortlist(this.selection, id));
	}

	toggleCompare(id: string): Promise<boolean> {
		if (this.explorer.compare.includes(id)) {
			return this.applySelection({ ok: true, selection: removeFromCompare(this.selection, id), message: 'Removed the comparison column. The product stays on your shortlist.' });
		}
		return this.applySelection(addToCompare(this.selection, id));
	}

	// ------------------------------------------------------------ notes
	noteFor(id: string): ProductNote {
		return this.session.notes[id] ?? { rationale: '', openChecks: '', criteriaFingerprint: this.fingerprint, updatedAt: '' };
	}

	setNote(id: string, patch: Partial<Pick<ProductNote, 'rationale' | 'openChecks'>>): void {
		this.updateSession((s) => {
			const current = s.notes[id] ?? { rationale: '', openChecks: '', criteriaFingerprint: this.fingerprint, updatedAt: '' };
			s.notes[id] = { ...current, ...patch, criteriaFingerprint: this.fingerprint, updatedAt: new Date().toISOString() };
		});
	}

	/** Mark a rationale as reviewed under the current criteria without changing its text. */
	confirmNote(id: string): void {
		this.updateSession((s) => {
			if (s.notes[id]) s.notes[id] = { ...s.notes[id]!, criteriaFingerprint: this.fingerprint, updatedAt: new Date().toISOString() };
		});
	}

	setInvestigationNote(value: string): void {
		this.updateSession((s) => {
			s.investigationNote = value;
		});
	}

	// ------------------------------------------------------------ disclosure and theme
	isOpen(key: string, fallback = false): boolean {
		return this.session.disclosure[key] ?? fallback;
	}

	setOpen(key: string, open: boolean): void {
		this.updateSession((s) => {
			s.disclosure[key] = open;
		});
	}

	setTheme(theme: 'light' | 'dark'): void {
		this.updateSession((s) => {
			s.theme = theme;
		});
		document.documentElement.dataset.theme = theme;
	}

	// ------------------------------------------------------------ MIM
	async mimRequest(action: 'load' | 'refresh', cachedOnly = false): Promise<void> {
		this.mimBusy = true;
		try {
			const response = await fetch(`/api/mim/${action}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ cachedOnly })
			});
			const body = (await response.json()) as { status: MimStatusView; products: Product[] | null };
			this.mimStatus = body.status;
			if (body.products) {
				this.mimProducts = body.products;
				this.updateSession((s) => {
					s.mimLoaded = true;
				});
			}
			if (!cachedOnly) this.announce(body.status.message);
		} catch {
			this.mimStatus = { ...this.mimStatus, state: this.mimProducts.length ? 'stale' : 'error', message: 'The explorer could not reach its own MIM endpoint. The curated catalogue remains available.', errorKind: 'unavailable' };
			if (!cachedOnly) this.announce(this.mimStatus.message);
		} finally {
			this.mimBusy = false;
		}
	}

	// ------------------------------------------------------------ provenance (curated records only)
	async ensureProvenance(ids: string[]): Promise<void> {
		const missing = ids.filter((id) => !(id in this.provenanceCache) && this.curated.some((p) => p.id === id));
		if (!missing.length) return;
		try {
			const response = await fetch(`/api/provenance?ids=${encodeURIComponent(missing.join(','))}`);
			if (!response.ok) return;
			const body = (await response.json()) as { provenance: Record<string, Record<string, ProvenanceRow>> };
			this.provenanceCache = { ...this.provenanceCache, ...body.provenance };
		} catch {
			// Provenance is supplementary; missing-state wording falls back to "Not established".
		}
	}

	/**
	 * Field evidence for missing-state wording: the full research-log rows when fetched,
	 * otherwise the compact not-found index shipped with the page.
	 */
	provenanceFor(id: string): Record<string, ProvenanceRow> | undefined {
		const full = this.provenanceCache[id];
		if (full) return full;
		const compact = this.notFound[id];
		if (!compact) return undefined;
		const blank = { product_id: id, recorded_value: '', source_title: '', source_url: '', source_type: '', evidence_level: '', notes: '' };
		return Object.fromEntries(Object.entries(compact).map(([field, date]) => [field, { ...blank, field_name: field, confidence: 'not_found', date_checked: date }]));
	}

	provenanceMap = $derived(Object.fromEntries(this.allProducts.map((p) => [p.id, this.provenanceFor(p.id)]).filter(([, v]) => v)) as Record<string, Record<string, ProvenanceRow>>);

	// ------------------------------------------------------------ session lifecycle
	updateSession(mutator: (draft: SessionData) => void): void {
		mutator(this.session);
		if (this.hydrated) this.persist();
	}

	private persist(): void {
		const ok = this.adapter.write($state.snapshot(this.session) as SessionData);
		this.persistent = ok;
	}

	announce(message: string): void {
		// Re-setting the same text should still be announced.
		this.announcement = '';
		queueMicrotask(() => (this.announcement = message));
	}

	/**
	 * Client start-up: read private session state, then restore the last public state when
	 * the page was opened without an explicit (v=1) URL. Explicit URL state always wins.
	 */
	async hydrate(): Promise<void> {
		this.adapter = createSessionAdapter(browserStorage());
		const { data, issues } = this.adapter.read();
		this.persistent = this.adapter.persistent;
		const parsed = parseUrlState(page.url.searchParams);
		if (parsed.explicit && page.url.searchParams.toString() !== data.lastQuery) {
			// A link from elsewhere: do not attribute it to a custom profile from this session.
			data.appliedCustomProfileId = null;
		}
		this.session = data;
		this.sessionIssues = this.adapter.persistent ? issues : [...issues, 'Browser session storage is unavailable, so profiles, notes and drafts will be lost when this page reloads. Use Copy selection summary to keep a record.'];
		this.hydrated = true;
		this.persist();
		if (data.theme) document.documentElement.dataset.theme = data.theme;
		if (data.mimLoaded && this.mimStatus.configured) void this.mimRequest('load', true);
		if (!parsed.explicit && data.lastQuery) {
			await goto(`${page.url.pathname}?${data.lastQuery}`, { replaceState: true, keepFocus: true, noScroll: true });
		}
	}

	/** Record the current explicit public state for same-session restoration. */
	rememberQuery(): void {
		if (!this.hydrated || !this.parsed.explicit) return;
		const query = page.url.searchParams.toString();
		if (this.session.lastQuery !== query) {
			this.session.lastQuery = query;
			this.persist();
		}
	}
}

export function setAppStore(store: AppStore): AppStore {
	return setContext(KEY, store);
}

export function app(): AppStore {
	return getContext<AppStore>(KEY);
}
