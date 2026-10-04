/** The caller's budget ran out before the worker reached the command: nothing ran, and nobody is waiting for it. */
export class RequestAbandonedError extends Error {
	constructor() {
		super(
			"The caller's deadline passed before the worker reached this command",
		);
		this.name = "RequestAbandonedError";
	}
}

/** The task is behind and this customer holds most of its checks: shed before any work, so other customers keep their latency. */
export class CustomerCheckShedError extends Error {
	constructor() {
		super("This customer's checks are being shed while the worker catches up");
		this.name = "CustomerCheckShedError";
	}
}

/** Shed and dropped requests come in floods: logged without a stack and sampled like successes. */
export function isDeadlineShed(cause: unknown): boolean {
	return (
		cause instanceof RequestAbandonedError ||
		cause instanceof CustomerCheckShedError
	);
}
