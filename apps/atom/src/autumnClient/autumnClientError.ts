export class AutumnClientError extends Error {
	readonly status: number;
	readonly code: string | null;

	constructor({
		path,
		status,
		code,
	}: {
		path: string;
		status: number;
		code: string | null;
	}) {
		super(`Autumn answered ${path} with ${status} (${code ?? "no code"})`);
		this.name = "AutumnClientError";
		this.status = status;
		this.code = code;
	}
}
