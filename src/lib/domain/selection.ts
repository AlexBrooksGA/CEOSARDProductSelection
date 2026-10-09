/**
 * Shortlist and comparison selection. The shortlist is independent and can retain many
 * candidates; the comparison is a unique subset of at most three that never silently
 * displaces an existing choice (port of `add_comparison`).
 */
import { addComparison } from './matching';

export const COMPARE_MAX = 3;
export const SHORTLIST_MAX = 60;

export interface Selection {
	shortlist: string[];
	compare: string[];
}

export type SelectionOutcome =
	| { ok: true; selection: Selection; message: string }
	| { ok: false; selection: Selection; message: string };

export function addToShortlist(selection: Selection, id: string): SelectionOutcome {
	if (selection.shortlist.includes(id)) return { ok: true, selection, message: 'Already on the shortlist.' };
	if (selection.shortlist.length >= SHORTLIST_MAX) {
		return { ok: false, selection, message: `The shortlist holds up to ${SHORTLIST_MAX} products. Remove one before adding another.` };
	}
	return { ok: true, selection: { ...selection, shortlist: [...selection.shortlist, id] }, message: 'Added to the shortlist.' };
}

export function removeFromShortlist(selection: Selection, id: string): Selection {
	return { shortlist: selection.shortlist.filter((item) => item !== id), compare: selection.compare.filter((item) => item !== id) };
}

/** Add to the comparison (and to the shortlist if needed) without displacing anything. */
export function addToCompare(selection: Selection, id: string): SelectionOutcome {
	let shortlist = selection.shortlist;
	if (!shortlist.includes(id)) {
		const added = addToShortlist(selection, id);
		if (!added.ok) return added;
		shortlist = added.selection.shortlist;
	}
	const [compare, accepted] = addComparison(selection.compare, id, COMPARE_MAX);
	if (!accepted) {
		return {
			ok: false,
			selection: { shortlist, compare: selection.compare },
			message: `You can compare up to ${COMPARE_MAX} products. Remove a comparison column first; your shortlist is unchanged.`
		};
	}
	return { ok: true, selection: { shortlist, compare }, message: 'Added to the comparison.' };
}

/** Removing a comparison column keeps the shortlist entry. */
export function removeFromCompare(selection: Selection, id: string): Selection {
	return { shortlist: selection.shortlist, compare: selection.compare.filter((item) => item !== id) };
}

/** Keep comparison IDs unique, capped, and members of the shortlist (shortlist gains any missing ID). */
export function normaliseSelection(selection: Selection): Selection {
	const shortlist = [...new Set(selection.shortlist)];
	const compare: string[] = [];
	for (const id of selection.compare) {
		if (compare.includes(id) || compare.length >= COMPARE_MAX) continue;
		compare.push(id);
		if (!shortlist.includes(id)) shortlist.push(id);
	}
	return { shortlist, compare };
}
