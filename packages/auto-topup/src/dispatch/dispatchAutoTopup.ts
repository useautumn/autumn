import {
	claimAutoTopupPendingKey,
	clearAutoTopupPendingKey,
} from "@autumn/cache";
import type {
	AutoTopupDispatchContext,
	AutoTopupDispatchResult,
	AutoTopupJobPayload,
} from "./types/autoTopupDispatch.js";

/** Runs the job at most once per pending window: claim the customer+feature key, then send. */
export const dispatchAutoTopup = async ({
	ctx,
	payload,
}: {
	ctx: AutoTopupDispatchContext;
	payload: AutoTopupJobPayload;
}): Promise<AutoTopupDispatchResult> => {
	const { customerId, featureId } = payload;
	const claim = await claimAutoTopupPendingKey({ ctx, ...payload });

	if (claim === "unavailable") {
		ctx.logger.warn(
			`[dispatchAutoTopup] Redis unavailable, skipping auto top-up for customer ${customerId} and feature ${featureId}`,
		);
		return { enqueued: false, reason: "redis_unavailable" };
	}
	if (claim === "pending_exists") {
		ctx.logger.warn(
			`[dispatchAutoTopup] Skipping auto top-up job for customer ${customerId} and feature ${featureId} because pending key already exists`,
		);
		return { enqueued: false, reason: "pending_key_exists" };
	}

	const sent = await ctx.sqsJobs.autoTopup.trySend(payload);
	if (!sent.sent) {
		// The claim must not outlive a job that never left: the next deduction retries.
		await clearAutoTopupPendingKey({ ctx, ...payload });
		return { enqueued: false, reason: "send_failed" };
	}
	ctx.logger.info(
		`[dispatchAutoTopup] Auto top-up job enqueued for customer ${customerId} and feature ${featureId}`,
	);
	return { enqueued: true, reason: "enqueued" };
};
