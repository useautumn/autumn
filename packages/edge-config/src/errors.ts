export class EdgeConfigNotConfiguredError extends Error {
	constructor() {
		super("Edge config S3 is not configured");
		this.name = "EdgeConfigNotConfiguredError";
	}
}
