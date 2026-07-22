import { formatMs, notNullish } from "@autumn/shared";
import { stripeSubscriptionScheduleToPhaseIndex } from "@/external/stripe/subscriptionSchedules/utils/convertStripeSubscriptionScheduleUtils";
import { getStripeSubscriptionLock } from "@/external/stripe/subscriptions/utils/lockStripeSubscriptionUtils";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addBillingChangeTag } from "../../../common/index.js";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext.js";
import { activateScheduledCustomerProducts } from "./activateScheduledCustomerProducts.js";
import { releaseScheduleIfLastPhase } from "./releaseScheduleIfLastPhase.js";
import { transitionSchedulePhaseCustomerProducts } from "./transitionSchedulePhaseCustomerProducts.js";

/** Activates and expires a subscription schedule boundary, then releases its final phase. */
export const handleSchedulePhaseChanges = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { stripeSubscription, previousAttributes, nowMs } = eventContext;
	const { logger } = ctx;

	// Check if subscription is locked (being modified by another process)
	const lock = await getStripeSubscriptionLock({
		stripeSubscriptionId: stripeSubscription.id,
	});
	if (lock) {
		logger.info(`[handleSchedulePhaseChanges] SKIP: subscription is locked`);
		return;
	}

	// Snapshot counts so we can detect whether this task actually moved any
	// customer products — i.e., a phase truly changed in this event.
	const updatesBefore = eventContext.updatedCustomerProducts.length;
	const insertsBefore = eventContext.insertedCustomerProducts.length;

	// Check if phase possibly changed (items changed and schedule exists)
	const phasePossiblyChanged =
		notNullish(previousAttributes?.items) &&
		notNullish(stripeSubscription.schedule);

	if (!phasePossiblyChanged) {
		await activateScheduledCustomerProducts({ ctx, eventContext });
		return;
	}

	const stripeSubscriptionSchedule = stripeSubscription.schedule;

	const currentPhaseIndex = stripeSubscriptionScheduleToPhaseIndex({
		stripeSubscriptionSchedule,
		nowMs,
	});

	logger.info(
		`[handleSchedulePhaseChanges] sub: ${stripeSubscription.id}, now: ${formatMs(nowMs)}, currentPhase: ${currentPhaseIndex + 1}/${stripeSubscriptionSchedule.phases.length}`,
	);

	await transitionSchedulePhaseCustomerProducts({ ctx, eventContext });

	await releaseScheduleIfLastPhase({ ctx, eventContext });

	if (
		eventContext.updatedCustomerProducts.length > updatesBefore ||
		eventContext.insertedCustomerProducts.length > insertsBefore
	) {
		addBillingChangeTag(eventContext, "phase_changed");
	}
};
