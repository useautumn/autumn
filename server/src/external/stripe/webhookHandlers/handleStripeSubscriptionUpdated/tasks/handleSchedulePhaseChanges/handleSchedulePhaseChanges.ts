import { formatMs, notNullish } from "@autumn/shared";
import { stripeSubscriptionScheduleToPhaseIndex } from "@/external/stripe/subscriptionSchedules/utils/convertStripeSubscriptionScheduleUtils";
import { getStripeWebhookSubscriptionLock } from "@/external/stripe/subscriptions/utils/lockStripeSubscriptionUtils";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { reconcileLicenseStateForCustomer } from "@/internal/licenses/actions/reconcile/reconcileLicenseState";
import { addBillingChangeTag } from "../../../common";
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
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { stripeSubscription, previousAttributes, nowMs } = eventContext;
	const { logger } = ctx;

	// Check if subscription is locked (being modified by another process)
	const lock = await getStripeWebhookSubscriptionLock({
		stripeSubscriptionId: stripeSubscription.id,
		ingressLock: ctx.ingressSubscriptionLock,
	});
	if (lock) {
		logger.info(`[handleSchedulePhaseChanges] SKIP: subscription is locked`);
		return;
	}

	// Snapshot counts so we can detect whether this task actually moved any
	// customer products — i.e., a phase truly changed in this event.
	const updatesBefore = eventContext.updatedCustomerProducts.length;
	const insertsBefore = eventContext.insertedCustomerProducts.length;

	// Step 1: Activate scheduled products; checkout trial-end updates have no schedule phase change.
	await activateScheduledCustomerProducts({ ctx, eventContext });

	// Check if phase possibly changed (items changed and schedule exists)
	const phasePossiblyChanged =
		notNullish(previousAttributes?.items) &&
		notNullish(stripeSubscription.schedule);

	// `activateScheduledCustomerProducts` can still mutate cusProducts on
	// non-phase-change events (e.g. checkout trial-end flows). Those are
	// NOT phase changes — only tag `phase_changed` once the canonical
	// Stripe-schedule advance signal is confirmed below.
	if (!phasePossiblyChanged) return;

	const stripeSubscriptionSchedule = stripeSubscription.schedule;

	const currentPhaseIndex = stripeSubscriptionScheduleToPhaseIndex({
		stripeSubscriptionSchedule,
		nowMs,
	});

	logger.info(
		`[handleSchedulePhaseChanges] sub: ${stripeSubscription.id}, now: ${formatMs(nowMs)}, currentPhase: ${currentPhaseIndex + 1}/${stripeSubscriptionSchedule.phases.length}`,
	);

	// Step 2: Expire ended customer products (uses updated customerProducts)
	await expireEndedCustomerProducts({ ctx, eventContext });

	// Step 3: Release schedule if at last phase
	await releaseScheduleIfLastPhase({ ctx, eventContext });

	if (
		eventContext.updatedCustomerProducts.length > updatesBefore ||
		eventContext.insertedCustomerProducts.length > insertsBefore
	) {
		addBillingChangeTag(eventContext, "phase_changed");

		// Phase transitions swap license parents outside any billing action —
		// converge now instead of on the customer's next read. No route
		// middleware here, so reconcile owns the cache drop.
		await reconcileLicenseStateForCustomer({
			ctx,
			idOrInternalId: eventContext.fullCustomer.internal_id,
			deleteCache: true,
		});
	}
};
