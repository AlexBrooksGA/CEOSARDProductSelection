/**
 * Aligned comparison rows. Three concepts stay in separate groups: CEOS-ARD assessment,
 * measured quality evidence, and the user's requirements and open checks. Highlighting
 * marks values that differ; it never implies better or worse.
 */
import { activeCriteria } from './criteria';
import {
	accessAction,
	assessmentLabel,
	bitDepthFact,
	coverageFact,
	instrumentResolutionFact,
	listFact,
	localAvailabilityFact,
	observationPeriodFact,
	outputEncodingFact,
	qualityEvidence,
	revisitFact,
	sourceLabel,
	spatialFact,
	textFact,
	updateFrequencyFact,
	type Fact
} from './facts';
import { criterionReasons } from './presentation';
import { evaluateProduct } from './matching';
import type { Criteria, Product, ProvenanceRow } from './types';

export interface ComparisonCell {
	text: string | null;
	/** Shown in place of a missing value. */
	missingText?: string;
	detail?: string | null;
	link?: { label: string; url: string } | null;
	links?: { label: string; url: string }[];
	state?: 'met' | 'outside' | 'unknown';
}

export interface ComparisonRow {
	id: string;
	label: string;
	help?: string;
	cells: ComparisonCell[];
	differs: boolean;
	/** Values cannot be compared directly (different metrics or bases). */
	incomparable?: string | null;
}

export interface ComparisonGroup {
	id: string;
	title: string;
	description: string;
	optional: boolean;
	rows: ComparisonRow[];
}

export const OPTIONAL_GROUPS = [
	{ id: 'technical', title: 'Technical characteristics' },
	{ id: 'instrument', title: 'Missions and instruments' },
	{ id: 'provenance', title: 'Provenance' }
] as const;
export const OPTIONAL_GROUP_IDS = OPTIONAL_GROUPS.map((group) => group.id) as string[];

function factCell(fact: Fact): ComparisonCell {
	return {
		text: fact.value,
		missingText: fact.missing?.text,
		detail: [fact.basis, fact.note].filter(Boolean).join(' · ') || null
	};
}

function row(id: string, label: string, cells: ComparisonCell[], help?: string): ComparisonRow {
	const comparable = cells.map((cell) => `${cell.text ?? cell.missingText ?? ''}|${cell.state ?? ''}`);
	return { id, label, help, cells, differs: new Set(comparable).size > 1 };
}

export function buildComparison(
	products: Product[],
	criteria: Criteria,
	optionalGroups: string[],
	provenance: Record<string, Record<string, ProvenanceRow>> = {}
): ComparisonGroup[] {
	const prov = (product: Product) => provenance[product.id];
	const groups: ComparisonGroup[] = [];

	groups.push({
		id: 'spatial-temporal',
		title: 'Spatial and temporal characteristics',
		description: 'Each temporal concept has its own row. Revisit does not establish continuity, delivery or local availability.',
		optional: false,
		rows: [
			row('spatial', 'Product spatial resolution', products.map((p) => factCell(spatialFact(p, prov(p)))), 'Product grid or resolution. An instrument value is shown only as a labelled display fallback.'),
			row('revisit', 'Nominal revisit', products.map((p) => factCell(revisitFact(p, prov(p)))), 'An observation opportunity, not guaranteed usable imagery.'),
			row('update', 'Product update frequency', products.map((p) => factCell(updateFrequencyFact(p, prov(p))))),
			row('record-period', 'Observation record period', products.map(() => factCell(observationPeriodFact()))),
			row('coverage', 'Reported coverage', products.map((p) => factCell(coverageFact(p, prov(p)))), 'Broad reported scope; not proof of coverage at a particular place.'),
			row('local', 'Local availability', products.map(() => factCell(localAvailabilityFact())))
		]
	});

	const active = activeCriteria(criteria);
	groups.push({
		id: 'requirements',
		title: 'My requirements and open checks',
		description: active.length
			? 'Reported characteristics against your screening criteria. Meeting them does not establish suitability for your application.'
			: 'No screening criteria are active. Area/period availability and task-specific checks remain open.',
		optional: false,
		rows: [
			...active.map(([name]) => {
				const cells = products.map((product) => {
					const reason = criterionReasons(evaluateProduct(product, { criteria }), criteria).find((item) => item.name === name);
					return reason
						? { text: reason.state === 'met' ? `Meets — reported ${reason.reported}` : reason.state === 'outside' ? `Outside — reported ${reason.reported}` : 'Needs evidence — not reported', state: reason.state, detail: `${reason.target} · ${reason.mode === 'required' ? 'Required' : 'Preferred'}` }
						: { text: null, missingText: 'Not evaluated' };
				});
				const label = criterionReasons(evaluateProduct(products[0]!, { criteria }), criteria).find((item) => item.name === name)?.label ?? name;
				return row(`criterion-${name}`, label, cells);
			}),
			row('open-checks', 'Open checks', products.map(() => ({ text: 'Area and period availability; task-specific accuracy and suitability', detail: 'Not checked by this explorer' })))
		]
	});

	groups.push({
		id: 'assessment',
		title: 'CEOS-ARD assessment',
		description: 'Conformance with a named Product Family Specification (PFS). PFS version is not a product processing version; Threshold and Goal are PFS terms, not your Required/Preferred settings.',
		optional: false,
		rows: [
			row('status', 'Assessment status', products.map((p) => ({ text: assessmentLabel(p).text, detail: p.ceos_ard_status !== assessmentLabel(p).text && !(p.ceos_ard_verified && p.ceos_ard_status === 'CEOS-ARD') ? `Recorded status: ${p.ceos_ard_status}` : null }))),
			row('pfs', 'PFS and version', products.map((p) => factCell(textFact(p, 'PFS', 'ceos_ard_pfs', prov(p))))),
			row('level', 'Assessment level', products.map((p) => factCell(textFact(p, 'Level', 'ceos_ard_assessment_level', prov(p))))),
			row('approval', 'Approval date', products.map((p) => factCell(textFact(p, 'Approval date', 'approval_date', prov(p))))),
			row(
				'evidence',
				'Assessment evidence',
				products.map((p) => {
					const links = [
						p.self_assessment_url ? { label: 'Self-assessment', url: p.self_assessment_url } : null,
						p.peer_review_url ? { label: 'Peer review', url: p.peer_review_url } : null
					].filter((item): item is { label: string; url: string } => Boolean(item));
					return { text: links.length ? links.map((l) => l.label).join(' and ') : null, missingText: 'No assessment documents linked', links };
				})
			),
			row('qualifications', 'Qualifications', products.map((p) => factCell(textFact(p, 'Qualifications', 'ard_tier_notes', prov(p)))))
		]
	});

	const quality = (kind: 'geometric' | 'radiometric') =>
		products.map((p) => {
			const evidence = qualityEvidence(p, kind, prov(p));
			return evidence.reported
				? { text: evidence.display, detail: [evidence.sourceKind, evidence.sourceTitle].filter(Boolean).join(' · ') || null, link: evidence.sourceUrl ? { label: 'Source', url: evidence.sourceUrl } : null }
				: { text: null, missingText: evidence.missing?.text };
		});
	const geometric = row('geometric', 'Geometric accuracy / uncertainty', quality('geometric'));
	const radiometric = row('radiometric', 'Radiometric accuracy / uncertainty', quality('radiometric'));
	for (const [qualityRow, prefix] of [[geometric, 'geometric_accuracy'], [radiometric, 'radiometric_accuracy']] as const) {
		const metrics = new Set(products.filter((p) => p[`${prefix}_display`]).map((p) => `${p[`${prefix}_metric`] ?? '?'}|${p[`${prefix}_unit`] ?? '?'}`));
		if (metrics.size > 1 || (metrics.size === 1 && [...metrics][0]!.includes('?'))) {
			qualityRow.incomparable = 'Reported values use different or unstated metrics, units or scopes; compare the definitions, not the numbers.';
		}
	}
	groups.push({
		id: 'quality',
		title: 'Measured quality evidence',
		description: 'Reported geometric or radiometric evidence with its source. Absent evidence does not mean poor quality; provider values are not assumed to be independent validation.',
		optional: false,
		rows: [geometric, radiometric]
	});

	groups.push({
		id: 'access',
		title: 'Format and access',
		description: 'External provider portals perform the next area, period and access checks. This explorer does not download or validate imagery.',
		optional: false,
		rows: [
			row('format', 'Data format', products.map((p) => factCell(textFact(p, 'Data format', 'data_format', prov(p))))),
			row(
				'access',
				'Access',
				products.map((p) => {
					const action = accessAction(p);
					return { text: action.fallback ? action.explanation : 'Sourced access link', link: action.url ? { label: action.label, url: action.url } : null };
				})
			)
		]
	});

	if (optionalGroups.includes('technical')) {
		groups.push({
			id: 'technical',
			title: 'Technical characteristics',
			description: 'Processing and encoding details. Output storage is not radiometric quality.',
			optional: true,
			rows: [
				row('correction', 'Atmospheric or radiometric correction', products.map((p) => factCell(textFact(p, '', 'atmospheric_correction', prov(p))))),
				row('dem', 'Elevation model', products.map((p) => factCell(textFact(p, '', 'elevation_model', prov(p))))),
				row('crs', 'Coordinate reference system', products.map((p) => factCell(textFact(p, '', 'coordinate_system', prov(p))))),
				row('encoding', 'Output encoding', products.map((p) => factCell(outputEncodingFact(p, prov(p))))),
				row('bits', 'Radiometric bit depth', products.map((p) => factCell(bitDepthFact(p, prov(p))))),
				row('swath', 'Swath width', products.map((p) => factCell(textFact(p, '', 'swath_width', prov(p))))),
				row('operational', 'Operational status', products.map((p) => factCell(textFact(p, '', 'operational_status', prov(p)))))
			]
		});
	}
	if (optionalGroups.includes('instrument')) {
		groups.push({
			id: 'instrument',
			title: 'Missions and instruments',
			description: 'Instrument values describe the sensor, not the delivered product.',
			optional: true,
			rows: [
				row('missions', 'Missions', products.map((p) => factCell(listFact(p, '', 'missions')))),
				row('instruments', 'Instruments', products.map((p) => factCell(listFact(p, '', 'instruments')))),
				row('sensor', 'Sensor or instrument type', products.map((p) => factCell(textFact(p, '', 'sensor_or_instrument_type', prov(p))))),
				row('instrument-resolution', 'Finest instrument resolution (display only)', products.map((p) => factCell(instrumentResolutionFact(p))))
			]
		});
	}
	if (optionalGroups.includes('provenance')) {
		groups.push({
			id: 'provenance',
			title: 'Provenance',
			description: 'Catalogue checking dates describe when sources were consulted, not when observations or measurements were made.',
			optional: true,
			rows: [
				row('source', 'Record source', products.map((p) => ({ text: sourceLabel(p.source_type) }))),
				row(
					'checked',
					'Catalogue last checked',
					products.map((p) => {
						const dates = [...new Set(Object.values(prov(p) ?? {}).map((r) => r.date_checked).filter(Boolean))].sort();
						return { text: dates.length ? dates.join(', ') : null, missingText: 'No research-log dates for this record' };
					})
				),
				row('notes', 'Record notes', products.map((p) => factCell(textFact(p, '', 'notes', prov(p)))))
			]
		});
	}
	return groups;
}
