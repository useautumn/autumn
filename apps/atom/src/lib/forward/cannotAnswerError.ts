/** Why Atom leaves a request to the Autumn API. */
export type ForwardReason =
	/** The body, query or version could not be read: the API answers with its own error. */
	| "unreadable_request"
	| "no_api_version"
	| "product_check"
	| "send_event"
	/** An entity's lock: the API deducts an entity's checks. */
	| "lock"
	/** A lock taken, or finalized, before 2.6: its finalize does not name its customer, which only the API can route. */
	| "lock_version"
	/** A finalize of a lock this slot holds no row for: the API's own, or one taken elsewhere (parked D1). */
	| "lock_not_held"
	/** A finalize after its lock's expiry, which Autumn's timer has settled or is about to. */
	| "lock_expired"
	/** A lock the API refuses or answers itself: on an allocated feature, or one nothing funds. */
	| "lock_unsupported"
	| "with_preview"
	| "customer_data"
	| "skip_cache"
	| "customer_not_stored"
	/** Autumn deleted the customer: no copy read before the delete is answered from. */
	| "customer_deleted"
	| "entity_not_stored"
	| "entity_deleted"
	/** The entity was read before its customer's latest evict, which may have replaced its rows. */
	| "entity_stale"
	| "feature_not_stored"
	/** The customer's latest push failed to store, so its rows are older than what Autumn sent. */
	| "subject_not_written"
	/** A send_event the Atom granted could not be journaled, so nothing was deducted here and the API deducts instead. */
	| "journal_not_written"
	/** Autumn has fallen too far behind this customer's journal: its send_event checks are the API's until it catches up. */
	| "journal_backlog"
	/** A secret key this thread does not hold yet: the API answers, and its verdict decides whether to hold it. */
	| "secret_key_not_known"
	/** The replica that owns the customer could not be reached, or shed the check before it ran. */
	| "owner_unavailable"
	/** A keyed request on a customer that just moved here, whose handoff has not landed: the API's claim decides it, not this copy. */
	| "handoff_late"
	/** A track by event name tracks every feature that lists it: the API maps those. */
	| "track_by_event"
	/** A track the caller waits on is answered with the API's per-balance deductions. */
	| "sync_track"
	/** An overage behaviour, a timestamp or a value that is not a deduction: the API's track semantics. */
	| "track_option"
	/** A version before 2.1 shapes a track's request and response its own way. */
	| "track_version"
	/** The balance does not cover the track: whether it caps, overflows or is refused is the API's to decide. */
	| "track_denied";

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
