/** Stands in for an error that was only logged as text, so Sentry still gets a stack pointing at the call site. */
export class LoggedMessageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LoggedMessageError";
	}
}
