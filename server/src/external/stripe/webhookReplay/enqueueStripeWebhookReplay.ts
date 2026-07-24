import { tryCatch } from "@autumn/shared";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import type { StripeWebhookContext } from "../webhookMiddlewares/stripeWebhookContext.js";

export const getStripeWebhookReplayQueueUrl = () =>
	process.env.STRIPE_WEBHOOK_SQS_QUEUE_URL;

/**
 * Queues a failed early-acked webhook for replay. Never throws — the caller
 * is a background failure path and enqueue is best-effort.
 */
export const enqueueStripeWebhookReplay = async ({
	ctx,
	failureReason,
}: {
	ctx: StripeWebhookContext;
	failureReason: string;
}): Promise<boolean> => {
	const { org, env, stripeEvent, logger } = ctx;

	const queueUrl = getStripeWebhookReplayQueueUrl();
	if (!queueUrl) {
		logger.warn(
			`[stripeWebhookReplay] STRIPE_WEBHOOK_SQS_QUEUE_URL not set, cannot queue failed event ${stripeEvent.id} for replay`,
		);
		return false;
	}

	const { error } = await tryCatch(
		addTaskToQueue({
			jobName: JobName.StripeWebhookReplay,
			queueUrl,
			payload: {
				orgId: org.id,
				env,
				stripeEvent,
				failedAt: Date.now(),
				failureReason,
			},
		}),
	);

	if (error) {
		logger.error(
			`[stripeWebhookReplay] Failed to queue event ${stripeEvent.id} for replay: ${error}`,
			{ error },
		);
		return false;
	}

	return true;
};
