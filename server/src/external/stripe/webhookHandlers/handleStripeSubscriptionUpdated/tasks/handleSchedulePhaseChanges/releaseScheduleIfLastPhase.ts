import { createStripeCli } from "@/external/connect/createStripeCli";
import { isStripeSubscriptionScheduleInLastPhase } from "@/external/stripe/subscriptionSchedules/utils/classifyStripeSubscriptionScheduleUtils";
import { stripeSubscriptionScheduleToPhaseIndex } from "@/external/stripe/subscriptionSchedules/utils/convertStripeSubscriptionScheduleUtils";
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

	// Stripe's `from_subscription` flow can briefly expose a transient 1-phase schedule before the final multi-phase update settles.
	const currentPhaseIndex = stripeSubscriptionScheduleToPhaseIndex({
		stripeSubscriptionSchedule,
		nowMs,
	});
	const currentPhase = stripeSubscriptionSchedule.phases[currentPhaseIndex];

	// Skip release only for that temporary single-phase shape while its future end date shows the real schedule has not settled yet.
	const isSingleFuturePhase =
		stripeSubscriptionSchedule.phases.length === 1 &&
		typeof currentPhase?.end_date === "number" &&
		currentPhase.end_date * 1000 > nowMs;

	if (isSingleFuturePhase) {
		logger.debug(
			`[handleSchedulePhaseChanges] skip release (single-phase schedule still ends in future)`,
		);
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
