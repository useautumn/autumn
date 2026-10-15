/** A caller's key this customer's journal already holds: the API answers it 409 (checkIdempotencyKey.ts). */
export class DuplicateIdempotencyKeyError extends Error {
	constructor({ key }: { key: string }) {
		super(
			`Another request with idempotency key ${key} has already been received`,
		);
		this.name = "DuplicateIdempotencyKeyError";
	}
}
