/** Throw from a job handler when retrying cannot help; the job fails without further attempts. */
export class PermanentJobError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "PermanentJobError";
	}
}
