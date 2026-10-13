import type { TrackParams } from "@autumn/shared";

/** Namespaces track's body-level key away from raw header keys, so the same
 *  client value used in both places stays two independent claims. */
export const getTrackBodyIdempotencyKey = ({
	body,
}: {
	body: TrackParams;
}): string | null =>
	body.idempotency_key ? `track:${body.idempotency_key}` : null;
