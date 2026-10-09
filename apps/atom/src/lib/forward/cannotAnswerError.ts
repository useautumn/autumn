/** Why Atom leaves a request to the Autumn API. */
export type ForwardReason =
	/** The body, query or version could not be read: the API answers with its own error. */
	| "unreadable_request"
	| "no_api_version"
	| "product_check"
	| "send_event"
	| "lock"
	| "with_preview"
	| "customer_data"
	| "skip_cache"
	| "customer_not_stored"
	| "entity_not_stored"
	| "feature_not_stored"
	/** A secret key this thread does not hold yet: the API answers, and its verdict decides whether to hold it. */
	| "secret_key_not_known";

/**
 * Thrown wherever Atom finds it cannot answer a request itself. One place catches it
 * and has the Autumn API answer instead, so no code path ever invents a response of its own.
 */
export class CannotAnswerError extends Error {
	readonly reason: ForwardReason;

	constructor({ reason }: { reason: ForwardReason }) {
		super(`Atom does not answer this request: ${reason}`);
		this.name = "CannotAnswerError";
		this.reason = reason;
	}
}
