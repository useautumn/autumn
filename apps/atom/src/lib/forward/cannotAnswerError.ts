export type ForwardReason =
	| "unreadable_request"
	| "no_api_version"
	| "product_check"
	| "send_event"
	| "lock"
	| "with_preview"
	| "customer_data"
	| "skip_cache"
	| "customer_not_stored"
	| "customer_deleted"
	| "entity_not_stored"
	| "entity_deleted"
	| "entity_stale"
	| "feature_not_stored"
	| "subject_not_written"
	| "secret_key_not_known";

export class CannotAnswerError extends Error {
	readonly reason: ForwardReason;

	constructor({ reason }: { reason: ForwardReason }) {
		super(`Atom does not answer this request: ${reason}`);
		this.name = "CannotAnswerError";
		this.reason = reason;
	}
}
