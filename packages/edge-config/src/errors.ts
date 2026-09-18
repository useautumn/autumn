/** A write was asked of a store whose bucket is unknown; the app decides what status that is. */
export class EdgeConfigNotConfiguredError extends Error {
	constructor() {
		super("Edge config S3 is not configured");
		this.name = "EdgeConfigNotConfiguredError";
	}
}
