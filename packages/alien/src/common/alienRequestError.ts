/** A manager call that did not answer, or answered with a non-2xx. */
export class AlienRequestError extends Error {
	readonly path: string;
	readonly status: number | null;
	readonly detail: string;

	constructor({
		path,
		status,
		detail,
	}: {
		path: string;
		status: number | null;
		detail: string;
	}) {
		super(`alien ${status ?? "unreachable"} on ${path}: ${detail}`);
		this.name = "AlienRequestError";
		this.path = path;
		this.status = status;
		this.detail = detail;
	}
}

export const isAlienRequestError = (
	error: unknown,
): error is AlienRequestError => error instanceof AlienRequestError;
