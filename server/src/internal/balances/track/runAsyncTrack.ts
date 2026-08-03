import { ErrCode, RecaseError, type TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { globalAsyncTrackSqsBatcher } from "./AsyncTrackSqsBatcher.js";
import { getAsyncTrackMessageGroupId } from "./utils/getAsyncTrackMessageGroupId.js";

const ASYNC_TRACK_UNAVAILABLE_MESSAGE =
	"Async track is not available right now";

export const runAsyncTrack = async ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: TrackParams;
}): Promise<void> => {
	const queueUrl = process.env.TRACK_ASYNC_SQS_QUEUE_URL;
	if (!queueUrl) {
		ctx.logger.error(
			"[track] async=true requested but TRACK_ASYNC_SQS_QUEUE_URL is unset",
		);
		throw new RecaseError({
			message: ASYNC_TRACK_UNAVAILABLE_MESSAGE,
			code: ErrCode.InternalError,
			statusCode: 503,
		});
	}
	const messageDeduplicationId = ctx.id;

	try {
		await globalAsyncTrackSqsBatcher.enqueue({
			queueUrl,
			payload: {
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: body.customer_id,
				entityId: body.entity_id,
				requestId: ctx.id,
				apiVersion: ctx.apiVersion.value,
				body,
			},
			messageGroupId: getAsyncTrackMessageGroupId({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: body.customer_id,
				entityId: body.entity_id,
				messageDeduplicationId,
			}),
			messageDeduplicationId,
		});
	} catch (error) {
		ctx.logger.warn("[track] Queue fallback failed (SQS)", {
			type: "track_queue_fallback_failed",
			error,
		});
		throw new RecaseError({
			message: ASYNC_TRACK_UNAVAILABLE_MESSAGE,
			code: ErrCode.InternalError,
			statusCode: 503,
		});
	}
};
