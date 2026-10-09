/**
 * Versioned, validated `sessionStorage` adapter for private session state: custom
 * profiles, notes, drafts, disclosure state and the last public state. Nothing here is
 * placed in URLs or sent to the server. Unavailable or corrupt storage degrades to
 * in-memory state with a visible notice.
 */
import { PRODUCT_ID_PATTERN } from '$lib/domain/catalogue';
import { PROFILE_DESCRIPTION_MAX, PROFILE_NAME_MAX, validateStoredProfile } from '$lib/domain/profiles';
import type { ProductNote } from '$lib/domain/summary';
import type { Profile } from '$lib/domain/types';

export const SESSION_KEY = 'ceos-ard-explorer';
export const SESSION_VERSION = 1;
export const NOTE_MAX = 4000;

export interface ProfileDraft {
	editingId: string | null;
	name: string;
	description: string;
}

export interface SessionData {
	version: typeof SESSION_VERSION;
	customProfiles: Profile[];
	notes: Record<string, ProductNote>;
	investigationNote: string;
	disclosure: Record<string, boolean>;
	/** Last explicit public query string, restored when a page is opened without one. */
	lastQuery: string;
	/** Custom profile last applied (custom profiles are never shared in links). */
	appliedCustomProfileId: string | null;
	profileDraft: ProfileDraft | null;
	theme: 'light' | 'dark' | null;
	/** Whether MIM records were deliberately loaded in this session. */
	mimLoaded: boolean;
}

export function emptySession(): SessionData {
	return {
		version: SESSION_VERSION,
		customProfiles: [],
		notes: {},
		investigationNote: '',
		disclosure: {},
		lastQuery: '',
		appliedCustomProfileId: null,
		profileDraft: null,
		theme: null,
		mimLoaded: false
	};
}

function text(value: unknown, max: number): string {
	return typeof value === 'string' ? value.slice(0, max) : '';
}

/** Validate untrusted stored data, keeping every valid part. */
export function validateSession(raw: unknown): { data: SessionData; issues: string[] } {
	const data = emptySession();
	const issues: string[] = [];
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return { data, issues: ['Saved session data could not be read and was reset.'] };
	}
	const record = raw as Record<string, unknown>;
	if (record.version !== SESSION_VERSION) {
		return { data, issues: ['Saved session data was from an incompatible version and was reset.'] };
	}
	if (Array.isArray(record.customProfiles)) {
		const seen = new Set<string>();
		for (const item of record.customProfiles) {
			const profile = validateStoredProfile(item);
			if (!profile || seen.has(profile.id)) {
				issues.push('A saved custom profile could not be read and was skipped.');
				continue;
			}
			seen.add(profile.id);
			data.customProfiles.push(profile);
		}
	}
	if (record.notes && typeof record.notes === 'object' && !Array.isArray(record.notes)) {
		for (const [id, note] of Object.entries(record.notes as Record<string, unknown>)) {
			if (!PRODUCT_ID_PATTERN.test(id) || !note || typeof note !== 'object') continue;
			const value = note as Record<string, unknown>;
			data.notes[id] = {
				rationale: text(value.rationale, NOTE_MAX),
				openChecks: text(value.openChecks, NOTE_MAX),
				criteriaFingerprint: text(value.criteriaFingerprint, 2000),
				updatedAt: text(value.updatedAt, 40)
			};
		}
	}
	data.investigationNote = text(record.investigationNote, NOTE_MAX);
	if (record.disclosure && typeof record.disclosure === 'object' && !Array.isArray(record.disclosure)) {
		for (const [key, value] of Object.entries(record.disclosure as Record<string, unknown>)) {
			if (typeof value === 'boolean' && key.length <= 100) data.disclosure[key] = value;
		}
	}
	data.lastQuery = text(record.lastQuery, 16_000);
	data.appliedCustomProfileId = typeof record.appliedCustomProfileId === 'string' && data.customProfiles.some((p) => p.id === record.appliedCustomProfileId) ? record.appliedCustomProfileId : null;
	if (record.profileDraft && typeof record.profileDraft === 'object') {
		const draft = record.profileDraft as Record<string, unknown>;
		data.profileDraft = {
			editingId: typeof draft.editingId === 'string' ? draft.editingId : null,
			name: text(draft.name, PROFILE_NAME_MAX * 2),
			description: text(draft.description, PROFILE_DESCRIPTION_MAX)
		};
	}
	data.theme = record.theme === 'light' || record.theme === 'dark' ? record.theme : null;
	data.mimLoaded = record.mimLoaded === true;
	return { data, issues };
}

export interface SessionAdapter {
	/** False when browser storage is unavailable; work then lasts only until the page reloads. */
	readonly persistent: boolean;
	read(): { data: SessionData; issues: string[] };
	write(data: SessionData): boolean;
}

/** Safe storage accessor: some browsers throw on access in private modes or with blocked storage. */
export function browserStorage(): Storage | null {
	try {
		const storage = globalThis.sessionStorage;
		const probe = `${SESSION_KEY}:probe`;
		storage.setItem(probe, '1');
		storage.removeItem(probe);
		return storage;
	} catch {
		return null;
	}
}

export function createSessionAdapter(storage: Storage | null): SessionAdapter {
	let persistent = storage !== null;
	return {
		get persistent() {
			return persistent;
		},
		read() {
			if (!storage) return { data: emptySession(), issues: [] };
			let raw: string | null;
			try {
				raw = storage.getItem(SESSION_KEY);
			} catch {
				persistent = false;
				return { data: emptySession(), issues: ['Browser session storage is unavailable.'] };
			}
			if (raw === null) return { data: emptySession(), issues: [] };
			try {
				return validateSession(JSON.parse(raw));
			} catch {
				return { data: emptySession(), issues: ['Saved session data could not be read and was reset.'] };
			}
		},
		write(data) {
			if (!storage) return false;
			try {
				storage.setItem(SESSION_KEY, JSON.stringify(data));
				persistent = true;
				return true;
			} catch {
				// Quota exceeded or storage revoked: keep working in memory.
				persistent = false;
				return false;
			}
		}
	};
}
