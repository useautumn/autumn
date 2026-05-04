import type { DeferredAutumnBillingPlanData } from "@autumn/shared";
import type { CheckoutSessionCompletedContext } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/setupCheckoutSessionCompletedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { executeStripeSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionScheduleAction";

/**
 * Creates the Stripe `subscription_schedule` for an enable_plan_immediately
 * createSchedule flow and returns its id.
 *
 * Today's request-time flow returns early on `stripeCheckoutSessionAction`
 * (executeStripeBillingPlan.ts:37-44), so the schedule action — already on
 * `billingPlan.stripe.subscriptionScheduleAction` from the request-time eval —
 * never executed. We execute it here against the now-real Stripe subscription.
 *
 * Phase 0 of the schedule action's params is irrelevant — Stripe's
 * `from_subscription` overwrites it with the subscription's items. Phases 1+
 * are deterministic from the schedule definition, so the request-time eval
 * stays valid.
 *
 * Returns null when there's no subscription or no schedule action (i.e. attach).
 */
export const createStripeScheduleFromCheckout = async ({
	ctx,
	checkoutContext,
	deferredData,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
	deferredData: DeferredAutumnBillingPlanData;
}): Promise<string | null> => {
	const { stripeSubscription } = checkoutContext;
	if (!stripeSubscription) return null;

	const subscriptionScheduleAction =
		deferredData.billingPlan.stripe.subscriptionScheduleAction;
	if (!subscriptionScheduleAction) return null;

	const stripeSchedule = await executeStripeSubscriptionScheduleAction({
		ctx,
		billingContext: {
			...deferredData.billingContext,
			stripeSubscription,
		},
		subscriptionScheduleAction,
		stripeSubscription,
	});

	return stripeSchedule?.id ?? null;
};
