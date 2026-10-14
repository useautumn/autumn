/** A caller's key this customer's journal already holds: answered 409, as the API's idempotency middleware answers. */
export class DuplicateIdempotencyKeyError extends Error {
	readonly key: string;

	constructor({ key }: { key: string }) {
		super(
			`Another request with idempotency key ${key} has already been received`,
		);
		this.name = "DuplicateIdempotencyKeyError";
		this.key = key;
	}
}
