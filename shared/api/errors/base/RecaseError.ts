/**
 * Base error class for all Autumn API errors
 * This should match the RecaseError interface from the server
 */
export class RecaseError extends Error {
	code: string;
	statusCode: number;
	data?: unknown;
	docsUrl?: string;

	constructor({
		message,
		code,
		statusCode = 400,
		data,
		docsUrl,
	}: {
		message: string;
		code?: string;
		statusCode?: number;
		data?: unknown;
		docsUrl?: string;
	}) {
		super(message);
		this.name = "RecaseError";
		this.code = code || "invalid_request";
		this.statusCode = statusCode;
		this.data = data;
		this.docsUrl = docsUrl;
	}
}
