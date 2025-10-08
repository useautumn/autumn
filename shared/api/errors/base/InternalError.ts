/**
 * Base error class for all Autumn API errors
 * This should match the RecaseError interface from the server
 */
export class InternalError extends Error {
	code: string;
	statusCode: number;
	data?: unknown;

	constructor({
		message,
		code,
		statusCode = 500,
		data,
	}: {
		message: string;
		code?: string;
		statusCode?: number;
		data?: unknown;
	}) {
		super(message);
		this.name = "InternalError";
		this.code = code || "internal_error";
		this.statusCode = statusCode;
		this.data = data;
	}
}
