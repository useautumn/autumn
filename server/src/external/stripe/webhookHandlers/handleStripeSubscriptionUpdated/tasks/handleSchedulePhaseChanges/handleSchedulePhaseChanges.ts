import { formatMs, notNullish } from "@autumn/shared";
import { stripeSubscriptionScheduleToPhaseIndex } from "@/external/stripe/subscriptionSchedules/utils/convertStripeSubscriptionScheduleUtils";
import { getStripeSubscriptionLock } from "@/external/stripe/subscriptions/utils/lockStripeSubscriptionUtils";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";
import { activateScheduledCustomerProducts } from "./activateScheduledCustomerProducts";
import { expireEndedCustomerProducts } from "./expireEndedCustomerProducts";
import { releaseScheduleIfLastPhase } from "./releaseScheduleIfLastPhase";

/**
 * Handles schedule phase changes for a subscription.
 *
 * This task:
 * 1. Activates scheduled customer products that should now be active
 * 2. Expires customer products that have ended (with default product fallback)
 * 3. Releases the subscription schedule if it's at its last phase
 */
export const handleSchedulePhaseChanges = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { stripeSubscription, previousAttributes, nowMs } =
		subscriptionUpdatedContext;
	const { logger } = ctx;

	// Check if subscription is locked (being modified by another process)
	const lock = await getStripeSubscriptionLock({
		stripeSubscriptionId: stripeSubscription.id,
	});
	if (lock) {
		logger.info(`[handleSchedulePhaseChanges] SKIP: subscription is locked`);
		return;
	}

	// Check if phase possibly changed (items changed and schedule exists)
	const phasePossiblyChanged =
		notNullish(previousAttributes?.items) &&
		notNullish(stripeSubscription.schedule);

	if (!phasePossiblyChanged) return;

	const stripeSubscriptionSchedule = stripeSubscription.schedule;

	const currentPhaseIndex = stripeSubscriptionScheduleToPhaseIndex({
		stripeSubscriptionSchedule,
		nowMs,
	});

	logger.info(
		`[handleSchedulePhaseChanges] sub: ${stripeSubscription.id}, now: ${formatMs(nowMs)}, currentPhase: ${currentPhaseIndex + 1}/${stripeSubscriptionSchedule.phases.length}`,
	);

	// Step 1: Activate scheduled customer products (modifies customerProducts in place)
	await activateScheduledCustomerProducts({
		ctx,
		subscriptionUpdatedContext,
	});

	// Step 2: Expire ended customer products (uses updated customerProducts from step 1)
	await expireEndedCustomerProducts({
		ctx,
		subscriptionUpdatedContext,
	});

	// Step 3: Release schedule if at last phase
	await releaseScheduleIfLastPhase({
		ctx,
		subscriptionUpdatedContext,
	});
};
