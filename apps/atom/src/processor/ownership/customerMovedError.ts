/** The customer's owner changed while this request was on its way here: the public port hops it to the owner named. */
export class CustomerMovedError extends Error {
	readonly owner: string;

	constructor({ owner }: { owner: string }) {
		super(`The customer moved to ${owner}`);
		this.name = "CustomerMovedError";
		this.owner = owner;
	}
}
