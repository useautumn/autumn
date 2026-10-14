import type { TrackParams } from "@autumn/shared";

export const getTrackBodyIdempotencyKey = ({
	body,
}: {
	body: TrackParams;
}): string | null =>
	body.idempotency_key ? `track:${body.idempotency_key}` : null;
