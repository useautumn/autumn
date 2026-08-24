// A command the ledger answered with a non-2xx status, so the caller can map it
// back onto the API's own error shape.
export class LedgerCommandError extends Error {
	readonly status: number;
	readonly code?: string;

	constructor({
		status,
		code,
		message,
	}: {
		status: number;
		code?: string;
		message: string;
	}) {
		super(message);
		this.name = "LedgerCommandError";
		this.status = status;
		this.code = code;
	}
}
