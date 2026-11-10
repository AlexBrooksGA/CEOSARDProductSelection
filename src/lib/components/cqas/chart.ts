/** Small presentation helpers shared by the C-QAS charts. */
import type { FindingStatus } from '$lib/domain/cqas';

export interface Tip {
	/** Anchor position as a percentage of the chart box. */
	x: number;
	y: number;
	title: string;
	lines: string[];
	note?: string;
}

export interface Ticks {
	lo: number;
	hi: number;
	ticks: number[];
}

/** Round, evenly spaced ticks covering [lo, hi] (and always including zero when it is inside). */
export function niceTicks(lo: number, hi: number, count = 4): Ticks {
	if (!(hi > lo)) hi = lo + 1;
	const raw = (hi - lo) / count;
	const power = 10 ** Math.floor(Math.log10(raw));
	const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((candidate) => candidate >= raw) ?? 10 * power;
	const start = Math.floor(lo / step + 1e-9) * step;
	const end = Math.ceil(hi / step - 1e-9) * step;
	const ticks: number[] = [];
	for (let value = start; value <= end + step / 2; value += step) ticks.push(Number(value.toFixed(10)));
	return { lo: start, hi: end, ticks };
}

export function tickLabel(value: number, signedLabels = false): string {
	if (value === 0) return '0';
	const text = Number(value.toPrecision(6)).toString();
	if (!signedLabels) return text;
	return value > 0 ? `+${text}` : `−${text.slice(1)}`;
}

export const STATUS_META: Record<FindingStatus, { cls: string; icon: string; label: string }> = {
	Met: { cls: 'met', icon: '✓', label: 'Met' },
	'Not met': { cls: 'notmet', icon: '✕', label: 'Not met' },
	'Not assessed': { cls: 'na', icon: '○', label: 'Not assessed' },
	'Not required': { cls: 'nr', icon: '–', label: 'Not required' }
};
