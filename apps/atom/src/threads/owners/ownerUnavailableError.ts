export class OwnerUnavailableError extends Error {
	constructor({ thread }: { thread: number }) {
		super(`Atom thread ${thread}, which holds this customer, is unavailable`);
		this.name = "OwnerUnavailableError";
	}
}
