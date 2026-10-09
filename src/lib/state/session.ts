/**
 * Versioned, validated `sessionStorage` adapter for private session state: custom
 * profiles, notes, drafts, disclosure state and the last public state. Nothing here is
 * placed in URLs or sent to the server. Unavailable or corrupt storage degrades to
 * in-memory state with a visible notice.
 */
import { PRODUCT_ID_PATTERN } from '$lib/domain/catalogue';
import { PROFILE_DESCRIPTION_MAX, PROFILE_NAME_MAX, validateStoredProfile } from '$lib/domain/profiles';
import type { CheckOutcome, JourneySettings, PurposeAnswers } from '$lib/domain/purpose';
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

export interface AppliedPurpose {
	answers: PurposeAnswers;
	key: string | null;
	guidanceVersion: string;
	mappingVersion: number;
	appliedAt: string;
	/** The journey-managed settings as applied; later differences mean "adjusted since setup". */
	settings: JourneySettings;
}

export interface PurposeSession {
	/** Unapplied answers (validated against the guidance by the store on read). */
	draft: unknown;
	applied: AppliedPurpose | null;
	/** The user chose "Skip to catalogue" in this session. */
	skipped: boolean;
	/** Private, user-entered outcomes per product and check. */
	checks: Record<string, Record<string, { outcome: CheckOutcome; note: string; purpose: string | null }>>;
}

export function emptyPurpose(): PurposeSession {
	return { draft: null, applied: null, skipped: false, checks: {} };
}

const OUTCOMES = new Set(['open', 'supports', 'concern', 'not-applicable']);

function validatePurpose(raw: unknown): PurposeSession {
	const purpose = emptyPurpose();
	if (!raw || typeof raw !== 'object') return purpose;
	const value = raw as Record<string, unknown>;
	purpose.draft = value.draft && typeof value.draft === 'object' ? value.draft : null;
	purpose.skipped = value.skipped === true;
	const applied = value.applied as Record<string, unknown> | null | undefined;
	if (applied && typeof applied === 'object' && applied.answers && typeof applied.answers === 'object' && applied.settings && typeof applied.settings === 'object') {
		const settings = applied.settings as Record<string, unknown>;
		const criterion = (c: unknown) => (c && typeof c === 'object' && typeof (c as Record<string, unknown>).value === 'number' && ['required', 'preferred', 'not_used'].includes(String((c as Record<string, unknown>).mode)) ? (c as JourneySettings['revisit_days']) : null);
		purpose.applied = {
			answers: applied.answers as PurposeAnswers,
			key: typeof applied.key === 'string' ? applied.key.slice(0, 130) : null,
			guidanceVersion: typeof applied.guidanceVersion === 'string' ? applied.guidanceVersion.slice(0, 20) : '',
			mappingVersion: typeof applied.mappingVersion === 'number' ? applied.mappingVersion : 0,
			appliedAt: typeof applied.appliedAt === 'string' ? applied.appliedAt.slice(0, 40) : '',
			settings: {
				family: typeof settings.family === 'string' ? settings.family : 'All product families',
				spatial_resolution_m: criterion(settings.spatial_resolution_m),
				revisit_days: criterion(settings.revisit_days)
			}
		};
	}
	if (value.checks && typeof value.checks === 'object') {
		for (const [productId, checks] of Object.entries(value.checks as Record<string, unknown>)) {
			if (!PRODUCT_ID_PATTERN.test(productId) || !checks || typeof checks !== 'object') continue;
			for (const [checkId, entry] of Object.entries(checks as Record<string, unknown>)) {
				const e = entry as Record<string, unknown> | null;
				if (!/^[a-z0-9-]{1,60}$/.test(checkId) || !e || !OUTCOMES.has(String(e.outcome))) continue;
				(purpose.checks[productId] ??= {})[checkId] = { outcome: e.outcome as CheckOutcome, note: text(e.note, NOTE_MAX), purpose: typeof e.purpose === 'string' ? e.purpose.slice(0, 130) : null };
			}
		}
	}
	return purpose;
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
	/** Purpose journey: draft answers, applied purpose, skip flag and private check outcomes. */
	purpose: PurposeSession;
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
		mimLoaded: false,
		purpose: emptyPurpose()
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
	data.purpose = validatePurpose(record.purpose);
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
