import type { TrackParams } from "@autumn/shared";
import { setRootSpanAttributes } from "@/utils/otel/rootSpan.js";

// Both are client-chosen strings.
const MAX_TRACK_ATTR_LENGTH = 200;

/** What a track asked for and did to the balance, on the root span. `balance` is a thunk so its math can never fail the track. */
export const setTrackSpanAttributes = ({
	body,
	balance,
	queued,
}: {
	body: TrackParams;
	balance?: () => { before?: number; after?: number; deducted?: number };
	/** The request only enqueued the track; a worker applies it later. */
	queued?: boolean;
}) =>
	setRootSpanAttributes(() => {
		const { before, after, deducted } = balance?.() ?? {};
		return {
			"track.feature_id": body.feature_id,
			"track.event_name": body.event_name?.slice(0, MAX_TRACK_ATTR_LENGTH),
			"track.idempotency_key":
				body.idempotency_key?.slice(0, MAX_TRACK_ATTR_LENGTH) || undefined,
			"track.value": body.value ?? 1,
			"balance.before": before,
			"balance.after": after,
			"balance.deducted": deducted,
			"track.queued": queued || undefined,
		};
	});
