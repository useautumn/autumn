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
