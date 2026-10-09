/**
 * Small text utilities that reproduce the Python behaviour the legacy prototype relied on.
 */

/**
 * Multi-character or non-lowercase mappings applied by Python's ``str.casefold``
 * after ``str.lower``. JavaScript's ``toLowerCase`` already matches ``lower`` for the
 * Basic Multilingual Plane; this table covers the full-case-folding differences that can
 * plausibly appear in product, mission or profile names. It is a documented
 * approximation, verified against Python-generated fixtures.
 */
const CASEFOLD_EXTRA: Record<string, string> = {
	'ß': 'ss',
	'ẞ': 'ss',
	'ſ': 's',
	'ς': 'σ',
	'µ': 'μ',
	'ŉ': 'ʼn',
	'ϐ': 'β',
	'ϑ': 'θ',
	'ϕ': 'φ',
	'ϖ': 'π',
	'ϰ': 'κ',
	'ϱ': 'ρ',
	'ϵ': 'ε',
	'ẚ': 'aʾ',
	'ẛ': 'ṡ',
	'ﬀ': 'ff',
	'ﬁ': 'fi',
	'ﬂ': 'fl',
	'ﬃ': 'ffi',
	'ﬄ': 'ffl',
	'ﬅ': 'st',
	'ﬆ': 'st'
};
const CASEFOLD_PATTERN = new RegExp(`[${Object.keys(CASEFOLD_EXTRA).join('')}]`, 'gu');

export function casefold(value: string): string {
	return value.toLowerCase().replace(CASEFOLD_PATTERN, (char) => CASEFOLD_EXTRA[char] ?? char);
}

/** Compare strings by Unicode code point, as Python does (not by UTF-16 code unit). */
export function compareCodePoints(a: string, b: string): number {
	if (a === b) return 0;
	const left = Array.from(a);
	const right = Array.from(b);
	const length = Math.min(left.length, right.length);
	for (let index = 0; index < length; index += 1) {
		const x = left[index]!.codePointAt(0)!;
		const y = right[index]!.codePointAt(0)!;
		if (x !== y) return x < y ? -1 : 1;
	}
	return left.length === right.length ? 0 : left.length < right.length ? -1 : 1;
}

/** Python's ``format(value, 'g')`` (six significant digits). */
export function formatG(value: number): string {
	if (Number.isNaN(value)) return 'nan';
	if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf';
	if (value === 0) return Object.is(value, -0) ? '-0' : '0';
	const exponential = value.toExponential(5);
	const [mantissa, exponentText] = exponential.split('e') as [string, string];
	const exponent = Number(exponentText);
	if (exponent < -4 || exponent >= 6) {
		const trimmed = mantissa.includes('.') ? mantissa.replace(/0+$/, '').replace(/\.$/, '') : mantissa;
		const sign = exponent < 0 ? '-' : '+';
		return `${trimmed}e${sign}${String(Math.abs(exponent)).padStart(2, '0')}`;
	}
	const fixed = value.toFixed(Math.max(0, 5 - exponent));
	return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}

/** Python ``re.sub(r"\s+", " ", value).strip()``. */
export function collapseWhitespace(value: string): string {
	return value.replace(/\s+/gu, ' ').trim();
}

/** Python truthiness for the values that appear in catalogue/API records. */
export function isPresent(value: unknown): boolean {
	return !(value === null || value === undefined || value === '');
}
