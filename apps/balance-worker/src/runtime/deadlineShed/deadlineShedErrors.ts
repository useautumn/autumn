/** The task is behind and this customer holds most of its checks: shed before any work, so other customers keep their latency. */
export class CustomerCheckShedError extends Error {
	constructor() {
		super("This customer's checks are being shed while the worker catches up");
		this.name = "CustomerCheckShedError";
	}
}

/** Shed checks come in floods: logged without a stack and sampled like successes. */
export function isShedCheck(cause: unknown): boolean {
	return cause instanceof CustomerCheckShedError;
}
