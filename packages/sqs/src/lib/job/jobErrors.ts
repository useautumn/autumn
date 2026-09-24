/** The body was not a job envelope, or the payload failed its schema. */
export class InvalidJobError extends Error {
	constructor({ name, cause }: { name?: string; cause?: unknown } = {}) {
		super(name ? `Invalid payload for job "${name}"` : "Invalid job envelope", {
			cause,
		});
		this.name = "InvalidJobError";
	}
}

/** A well-formed envelope naming a job this queue does not carry. */
export class UnknownJobError extends Error {
	readonly jobName: string;
	constructor({ jobName }: { jobName: string }) {
		super(`Unknown job "${jobName}"`);
		this.name = "UnknownJobError";
		this.jobName = jobName;
	}
}
