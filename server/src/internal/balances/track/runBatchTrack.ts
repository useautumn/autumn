import { ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { BatchTrackEntry } from "./batchTrackEntries.js";
import { getAsyncTrackMessageGroupId } from "./utils/getAsyncTrackMessageGroupId.js";
import { getTrackFeatureDeductionsForBody } from "./utils/getFeatureDeductions.js";
import { queueTrack } from "./utils/queueTrack.js";

const ASYNC_TRACK_UNAVAILABLE_MESSAGE =
	"Async track is not available right now";
const LOGGED_FAILURE_LIMIT = 25;

export const runBatchTrack = async ({
	ctx,
	entries,
}: {
	ctx: AutumnContext;
	entries: BatchTrackEntry[];
}): Promise<void> => {
	for (const { item } of entries) {
		getTrackFeatureDeductionsForBody({ ctx, body: item });
	}

	// One queueTrack per item — the SQS send batcher packs them into
	// SendMessageBatch calls, and each item resolves/fails independently.
	const results = await Promise.all(
		entries.map(({ item, index }) => {
			const messageDeduplicationId = `${ctx.id}-${index}`;

			return queueTrack({
				ctx,
				body: item,
				options: {
					// Per-item request id: seeds the per-item queue replay keys, so
					// same-customer items in one batch never collide on dedup.
					requestId: messageDeduplicationId,
					messageGroupId: getAsyncTrackMessageGroupId({
						orgId: ctx.org.id,
						env: ctx.env,
						customerId: item.customer_id,
						entityId: item.entity_id,
						messageDeduplicationId,
					}),
					messageDeduplicationId,
					// Batch items have no accept-time claim — the worker claims.
					validateTrackBodyIdempotencyKey: true,
					// A 202 here is the batch contract, not a degradation signal.
					logFallback: false,
					markQueuedForReplay: false,
				},
			});
		}),
	);

	const failures = results.flatMap((result, position) =>
		result === null ? [{ index: entries[position].index }] : [],
	);
	const successCount = results.length - failures.length;

	if (failures.length > 0) {
		const isTotalFailure = successCount === 0;
		ctx.logger.error(
			isTotalFailure
				? "[track] batch track enqueue failed"
				: "[track] batch track enqueue had partial failures",
			{
				type: isTotalFailure
					? "batch_track_enqueue_failure"
					: "batch_track_enqueue_partial_failure",
				success_count: successCount,
				failure_count: failures.length,
				total_count: results.length,
				failures: failures.slice(0, LOGGED_FAILURE_LIMIT),
				omitted_failure_count: Math.max(
					failures.length - LOGGED_FAILURE_LIMIT,
					0,
				),
			},
		);

		if (isTotalFailure) {
			throw new RecaseError({
				message: ASYNC_TRACK_UNAVAILABLE_MESSAGE,
				code: ErrCode.InternalError,
				statusCode: 503,
			});
		}
	}
};
