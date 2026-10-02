/**
 * Base error class for all Autumn API errors
 * This should match the RecaseError interface from the server
 */
export class RecaseError extends Error {
	code: string;
	statusCode: number;
	data?: unknown;
	/** Returned to the client alongside the message; `data` is never sent to the client. */
	details?: Record<string, unknown>;

	constructor({
		message,
		code,
		statusCode = 400,
		data,
		cause,
		details,
	}: {
		message: string;
		code?: string;
		statusCode?: number;
		data?: unknown;
		/** What actually failed; Sentry shows it as a linked exception. */
		cause?: unknown;
		details?: Record<string, unknown>;
	}) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = "RecaseError";
		this.code = code || "invalid_request";
		this.statusCode = statusCode;
		this.data = data;
		this.details = details;
	}
}
