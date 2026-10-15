import type { CheckRequest } from "../types/check.js";
import type { TrackRequest } from "../types/track.js";
import type { CallerKey } from "./createCallerKeyClaims.js";

/** A track's body key, claimed as the API's track claims it (`track:<key>`); null for a keyless track. */
export const trackCallerKeyOf = ({
	request,
}: {
	request: TrackRequest;
}): CallerKey | null =>
	request.idempotencyKey
		? { claim: `track:${request.idempotencyKey}`, sent: request.idempotencyKey }
		: null;

/** A deducting check's Idempotency-Key, claimed raw as the API's middleware claims it; null for a check that deducts nothing or sent none. */
export const checkCallerKeyOf = ({
	request,
}: {
	request: CheckRequest;
}): CallerKey | null => {
	const deducts =
		request.params.send_event === true || request.params.lock !== undefined;
	return deducts && request.idempotencyKey
		? { claim: request.idempotencyKey, sent: request.idempotencyKey }
		: null;
};
