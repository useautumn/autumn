import { createStripeCli } from "@/external/connect/createStripeCli";
import { isStripeSubscriptionScheduleInLastPhase } from "@/external/stripe/subscriptionSchedules/utils/classifyStripeSubscriptionScheduleUtils";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";

/**
 * Releases the subscription schedule if it's in its last phase.
 * This allows the subscription to continue without a schedule.
 */
export const releaseScheduleIfLastPhase = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
}): Promise<boolean> => {
	const { db, org, env, logger } = ctx;
	const { stripeSubscription, nowMs } = eventContext;

	const stripeSubscriptionSchedule = stripeSubscription.schedule;
	if (!stripeSubscriptionSchedule) return false;

	if (
		!isStripeSubscriptionScheduleInLastPhase({
			stripeSubscriptionSchedule,
			nowMs,
		})
	) {
		return false;
	}

	logger.debug(
		`[handleSchedulePhaseChanges] releasing schedule (last phase reached)`,
	);

	const stripeCli = createStripeCli({ org, env });

	try {
		await stripeCli.subscriptionSchedules.release(
			stripeSubscriptionSchedule.id,
		);

		await CusProductService.updateByStripeScheduledId({
			db,
			stripeScheduledId: stripeSubscriptionSchedule.id,
			updates: {
				scheduled_ids: [],
			},
		});

		return true;
	} catch (error: unknown) {
		if (error instanceof Error) {
			if (process.env.NODE_ENV === "development") {
				logger.warn(
					`[handleSchedulePhaseChanges] failed to release schedule: ${error.message}`,
				);
			} else {
				logger.error(
					`[handleSchedulePhaseChanges] failed to release schedule: ${error.message}`,
				);
			}
		}
		return false;
	}
};
