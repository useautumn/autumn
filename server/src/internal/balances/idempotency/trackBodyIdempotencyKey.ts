import type { TrackParams } from "@autumn/shared";

/** A client key as a deduction claims it: a track's body key, a deducting check's header key, an Atom's hand-in. */
export const toTrackIdempotencyKey = ({ key }: { key: string }): string =>
	`track:${key}`;

/** Namespaces track's body-level key away from raw header keys, so the same
 *  client value used in both places stays two independent claims. */
export const getTrackBodyIdempotencyKey = ({
	body,
}: {
	body: TrackParams;
}): string | null =>
	body.idempotency_key
		? toTrackIdempotencyKey({ key: body.idempotency_key })
		: null;
