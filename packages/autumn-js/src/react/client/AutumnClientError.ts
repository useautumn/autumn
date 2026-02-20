/** Error thrown by Autumn client */
export class AutumnClientError extends Error {
	code: string;
	statusCode: number;
	details?: unknown;

	constructor({
		message,
		code,
		statusCode,
		details,
	}: {
		message: string;
		code: string;
		statusCode: number;
		details?: unknown;
	}) {
		super(message);
		this.name = "AutumnClientError";
		this.code = code;
		this.statusCode = statusCode;
		this.details = details;
	}
}
