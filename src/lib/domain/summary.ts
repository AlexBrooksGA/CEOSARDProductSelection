/**
 * "Copy selection summary": a provisional, dated decision record — not a certificate.
 */
import { activeCriteria, describeCriterion } from './criteria';
import type { ExplorerState } from './explorer';
import { accessAction, assessmentLabel, revisitFact, spatialFact } from './facts';
import { familyLabel } from './guidance';
import { SCOPE_LABELS } from './profiles';
import { CHECK_OUTCOME_LABELS, checkActions, type CheckOutcome, type Guidance, type ResolvedCheck } from './purpose';
import type { Product, ProvenanceRow } from './types';

export interface SummaryPurpose {
	sentence: string;
	statusLabel: string;
	guidance: Guidance;
	source: 'session' | 'link';
	output: string | null;
	area: string;
	period: string;
	assumptions: string[];
	notes: string[];
	outputNote: string | null;
	checks: ResolvedCheck[];
	outcome: (productId: string, checkId: string) => { outcome: CheckOutcome; note: string } | null;
	adjusted: boolean;
}

export interface ProductNote {
	rationale: string;
	openChecks: string;
	/** Criteria fingerprint when the note was last edited. */
	criteriaFingerprint: string;
	updatedAt: string;
}

export interface SummaryInput {
	snapshot: Date;
	shareUrl: string;
	state: ExplorerState;
	products: Record<string, Product>;
	notes: Record<string, ProductNote>;
	investigationNote: string;
	currentFingerprint: string;
	provenance: Record<string, Record<string, ProvenanceRow>>;
	unresolvedReason: (id: string) => string;
	purpose?: SummaryPurpose | null;
}

export function noteNeedsReview(note: ProductNote | undefined, currentFingerprint: string): boolean {
	return Boolean(note && (note.rationale.trim() || note.openChecks.trim()) && note.criteriaFingerprint !== currentFingerprint);
}

export function buildSelectionSummary(input: SummaryInput): string {
	const { state } = input;
	const lines: string[] = [];
	lines.push('CEOS-ARD Product Explorer — provisional selection summary');
	lines.push(`Snapshot: ${input.snapshot.toISOString()}`);
	lines.push('This is a provisional decision record, not an approval or quality certificate. CEOS-ARD assessment does not establish suitability for a particular application.');
	lines.push(`Link (reproduces selections and criteria, not an immutable catalogue): ${input.shareUrl}`);
	const purpose = input.purpose;
	if (purpose) {
		lines.push('');
		lines.push('Purpose (your context — not a CEOS suitability assessment)');
		lines.push(`- ${purpose.sentence}`);
		if (purpose.output) lines.push(`- Intended output: ${purpose.output}`);
		if (purpose.area.trim()) lines.push(`- Area (your description; not searched or checked): ${purpose.area.trim()}`);
		if (purpose.period.trim()) lines.push(`- Period (your description; not checked): ${purpose.period.trim()}`);
		lines.push(`- Guidance: ${purpose.statusLabel}; guidance version ${purpose.guidance.version}, mapping version ${purpose.guidance.mapping_version}${purpose.source === 'link' ? '; purpose from a shared link (private details are not shared)' : ''}`);
		if (purpose.adjusted) lines.push('- Filters were adjusted after the purpose was applied.');
		for (const assumption of purpose.assumptions) lines.push(`- Assumption: ${assumption}`);
		for (const note of purpose.notes) lines.push(`- Note: ${note}`);
		if (purpose.outputNote) lines.push(`- From products to your output: ${purpose.outputNote}`);
		const cited = [...new Set(purpose.checks.flatMap((check) => check.sources))];
		for (const id of cited) {
			const source = purpose.guidance.sources.find((s) => s.id === id);
			if (source) lines.push(`- Source: ${source.title} (${source.publisher}, ${source.year}) ${source.url}`);
		}
	}
	lines.push('');
	lines.push('Criteria');
	lines.push(`- Catalogue scope: ${SCOPE_LABELS[state.scope]}`);
	lines.push(`- Measurement family: ${familyLabel(state.family)}`);
	if (state.search.trim()) lines.push(`- Search: “${state.search.trim()}”`);
	if (state.providers.length) lines.push(`- Providers: ${state.providers.join(', ')}`);
	if (state.sensor.trim()) lines.push(`- Sensor or instrument type contains: “${state.sensor.trim()}”`);
	if (state.operational.length) lines.push(`- Operational status: ${state.operational.join(', ')}`);
	if (state.sources.length) lines.push(`- Record sources: ${state.sources.join(', ')}`);
	if (state.hideUnknown) lines.push('- Records with unreported values for active criteria: hidden');
	const active = activeCriteria(state.criteria);
	if (active.length) for (const [name, setting] of active) lines.push(`- ${describeCriterion(name, setting)}`);
	else lines.push('- No screening criteria active');
	if (input.investigationNote.trim()) {
		lines.push('');
		lines.push('Investigation notes (do not filter results)');
		lines.push(input.investigationNote.trim());
	}
	lines.push('');
	lines.push(`Shortlist (${state.shortlist.length}); compared: ${state.compare.length ? state.compare.join(', ') : 'none'}`);
	for (const id of state.shortlist) {
		const product = input.products[id];
		lines.push('');
		if (!product) {
			lines.push(`* ${id} — record not available: ${input.unresolvedReason(id)}`);
		} else {
			const assessment = assessmentLabel(product);
			lines.push(`* ${product.product_name} [${product.id}]${state.compare.includes(id) ? ' (compared)' : ''}`);
			lines.push(`  Provider: ${product.provider ?? 'Not reported'} · Family: ${familyLabel(product.product_family)}`);
			lines.push(`  Assessment: ${assessment.text}${product.ceos_ard_pfs ? ` · PFS ${product.ceos_ard_pfs}` : ''}${product.approval_date ? ` · approved ${product.approval_date}` : ''}`);
			const spatial = spatialFact(product);
			const revisit = revisitFact(product);
			lines.push(`  ${spatial.label}: ${spatial.value ?? spatial.missing?.text ?? 'Not established'} · ${revisit.label}: ${revisit.value ?? revisit.missing?.text ?? 'Not established'}`);
			const links = [
				['Access', accessAction(product).url],
				['Documentation', product.information_url],
				['Self-assessment', product.self_assessment_url],
				['Peer review', product.peer_review_url]
			].filter(([, url]) => url);
			for (const [label, url] of links) lines.push(`  ${label}: ${url}`);
			const dates = [...new Set(Object.values(input.provenance[id] ?? {}).map((row) => row.date_checked).filter(Boolean))].sort();
			lines.push(`  Catalogue sources last checked: ${dates.length ? dates.join(', ') : 'not recorded'} (checking date, not observation date)`);
			lines.push('  Open by default: availability for the area and period; task-specific accuracy and suitability.');
		}
		if (purpose && purpose.checks.length) {
			lines.push('  Purpose checks (outcomes are your own records, not sourced facts):');
			for (const check of purpose.checks) {
				const outcome = purpose.outcome(id, check.id);
				const status = outcome ? CHECK_OUTCOME_LABELS[outcome.outcome] : 'Open';
				const next = product ? checkActions(check, product, purpose.guidance).filter((a) => !a.internal).map((a) => `${a.label}: ${a.url}`).join('; ') : '';
				lines.push(`  - ${check.label} — ${status}${outcome?.note ? ` (${outcome.note})` : ''}${next ? ` — next: ${next}` : ''}`);
			}
		}
		const note = input.notes[id];
		if (note?.rationale.trim()) lines.push(`  Why retained: ${note.rationale.trim()}`);
		if (note?.openChecks.trim()) lines.push(`  Open checks: ${note.openChecks.trim()}`);
		if (noteNeedsReview(note, input.currentFingerprint)) lines.push('  REVIEW RATIONALE: criteria changed since this note was written.');
	}
	return lines.join('\n');
}
