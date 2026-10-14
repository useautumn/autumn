export class RecaseError extends Error {
	code: string;
	statusCode: number;
	data?: unknown;
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
