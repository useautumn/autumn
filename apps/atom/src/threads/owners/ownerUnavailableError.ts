/** The thread that owns the customer is restarting or too far behind: a 503, so the caller asks the Autumn API instead. */
export class OwnerUnavailableError extends Error {
	constructor({ thread }: { thread: number }) {
		super(`Atom thread ${thread}, which holds this customer, is unavailable`);
		this.name = "OwnerUnavailableError";
	}
}
