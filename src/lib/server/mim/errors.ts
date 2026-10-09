/** Safe, user-facing MIM error categories. Messages never include credentials, headers or payloads. */
export type MimErrorKind = 'not_configured' | 'auth' | 'timeout' | 'unavailable' | 'http' | 'schema' | 'response' | 'untrusted_url' | 'too_large';

export const MIM_ERROR_MESSAGES: Record<MimErrorKind, string> = {
	not_configured: 'MIM is not configured for this deployment. The curated catalogue remains available.',
	auth: 'MIM API authentication failed. The curated catalogue remains available.',
	timeout: 'The MIM service timed out. The curated catalogue remains available.',
	unavailable: 'The MIM service is currently unavailable. The curated catalogue remains available.',
	http: 'The MIM service returned an error. The curated catalogue remains available.',
	schema: 'The MIM API schema has changed or could not be read. The curated catalogue remains available.',
	response: 'The MIM service returned an unexpected response. The curated catalogue remains available.',
	untrusted_url: 'The MIM schema pointed outside the configured API. The request was not made.',
	too_large: 'The MIM response exceeded the size limit. The curated catalogue remains available.'
};

export class MimError extends Error {
	readonly kind: MimErrorKind;
	/** Internal detail for server logs (never sent to the browser). */
	readonly detail: string;
	constructor(kind: MimErrorKind, detail: string) {
		super(MIM_ERROR_MESSAGES[kind]);
		this.name = 'MimError';
		this.kind = kind;
		this.detail = detail;
	}
}
