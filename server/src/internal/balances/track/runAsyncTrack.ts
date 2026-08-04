import {
	ErrCode,
	RouteGroup,
	RecaseError,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackBodyIdempotencyKey } from "@/internal/balances/idempotency/trackBodyIdempotencyKey.js";
import { withIdempotencyKey } from "@/internal/misc/idempotency/withIdempotencyKey.js";
import { getAsyncTrackMessageGroupId } from "./utils/getAsyncTrackMessageGroupId.js";
import { queueTrack } from "./utils/queueTrack.js";

const ASYNC_TRACK_UNAVAILABLE_MESSAGE =
	"Async track is not available right now";

const throwAsyncTrackUnavailable = (): never => {
	throw new RecaseError({
		message: ASYNC_TRACK_UNAVAILABLE_MESSAGE,
		code: ErrCode.InternalError,
		statusCode: 503,
	});
};

export const runAsyncTrack = async ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: TrackParams;
}): Promise<void> => {
	const messageDeduplicationId = ctx.id;

	// The body key is claimed at accept time (duplicate → 409) and KEPT — the
	// worker skips its own claim (queueTrack marks the message). The 503 below
	// releases the claim via the wrapper's error policy, so a failed enqueue
	// stays retryable.
	await withIdempotencyKey({
		ctx,
		idempotencyKey: getTrackBodyIdempotencyKey({ body }),
		routeGroup: RouteGroup.Balances,
		run: async () => {
			const queuedResponse = await queueTrack({
				ctx,
				body,
				options: {
					// Shards each customer across 8 FIFO groups — async trades
					// strict per-customer ordering for parallel consumption.
					messageGroupId: getAsyncTrackMessageGroupId({
						orgId: ctx.org.id,
						env: ctx.env,
						customerId: body.customer_id,
						entityId: body.entity_id,
						messageDeduplicationId,
					}),
					messageDeduplicationId,
					// A 202 here is the async contract, not a degradation signal.
					logFallback: false,
					markQueuedForReplay: false,
				},
			});

			if (!queuedResponse) {
				throwAsyncTrackUnavailable();
			}
		},
	});
};
