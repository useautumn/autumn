/**
 * Base error class for all Autumn API errors
 * This should match the RecaseError interface from the server
 */
export class RecaseError extends Error {
	code: string;
	statusCode: number;
	data?: unknown;

	constructor({
		message,
		code,
		statusCode = 400,
		data,
		cause,
	}: {
		message: string;
		code?: string;
		statusCode?: number;
		data?: unknown;
		/** What actually failed; Sentry shows it as a linked exception. */
		cause?: unknown;
	}) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = "RecaseError";
		this.code = code || "invalid_request";
		this.statusCode = statusCode;
		this.data = data;
	}
}
