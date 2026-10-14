import {
	ErrCode,
	RecaseError,
	RouteGroup,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackBodyIdempotencyKey } from "@/internal/balances/idempotency/trackBodyIdempotencyKey.js";
import type { TokenDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
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
	tokens,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	tokens?: TokenDeduction;
}): Promise<void> => {
	const messageDeduplicationId = ctx.id;

	await withIdempotencyKey({
		ctx,
		idempotencyKey: getTrackBodyIdempotencyKey({ body }),
		routeGroup: RouteGroup.Balances,
		run: async () => {
			const queuedResponse = await queueTrack({
				ctx,
				body,
				tokens,
				options: {
					messageGroupId: getAsyncTrackMessageGroupId({
						orgId: ctx.org.id,
						env: ctx.env,
						customerId: body.customer_id,
						entityId: body.entity_id,
						messageDeduplicationId,
					}),
					messageDeduplicationId,
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
