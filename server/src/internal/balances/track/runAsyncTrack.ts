import { ErrCode, RecaseError, type TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { queueTrack } from "./utils/queueTrack.js";

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

	const queued = await queueTrack({ ctx, body, queueUrl });
	if (!queued) {
		throw new RecaseError({
			message: ASYNC_TRACK_UNAVAILABLE_MESSAGE,
			code: ErrCode.InternalError,
			statusCode: 503,
		});
	}
};
