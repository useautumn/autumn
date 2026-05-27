import { type BatchTrackParams, ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackFeatureDeductionsForBody } from "./utils/getFeatureDeductions.js";
import { queueTrack } from "./utils/queueTrack.js";

const ASYNC_TRACK_UNAVAILABLE_MESSAGE =
	"Async track is not available right now";

export const runBatchTrack = async ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: BatchTrackParams;
}): Promise<void> => {
	const queueUrl = process.env.TRACK_ASYNC_SQS_QUEUE_URL;
	if (!queueUrl) {
		ctx.logger.error(
			"[track] batch track requested but TRACK_ASYNC_SQS_QUEUE_URL is unset",
		);
		throw new RecaseError({
			message: ASYNC_TRACK_UNAVAILABLE_MESSAGE,
			code: ErrCode.InternalError,
			statusCode: 503,
		});
	}

	for (const item of body) {
		getTrackFeatureDeductionsForBody({ ctx, body: item });
	}

	for (const [index, item] of body.entries()) {
		const queued = await queueTrack({
			ctx,
			body: item,
			queueUrl,
			messageDeduplicationId: `${ctx.id}-${index}`,
		});

		if (!queued) {
			throw new RecaseError({
				message: ASYNC_TRACK_UNAVAILABLE_MESSAGE,
				code: ErrCode.InternalError,
				statusCode: 503,
			});
		}
	}
};
