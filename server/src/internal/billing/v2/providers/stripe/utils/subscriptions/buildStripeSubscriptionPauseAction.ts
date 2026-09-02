import type { BillingContext, StripeSubscriptionAction } from "@autumn/shared";
import { msToSeconds } from "@shared/utils/common/unixUtils";
import type Stripe from "stripe";
import { buildStripeSubscriptionUpdateParams } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/buildStripeSubscriptionParams";

/**
 * Builds the single Stripe call a pause/resume makes: flip `pause_collection`
 * and nothing else.
 *
 * `void` stops Stripe from collecting during the pause — invoices for the
 * paused cycles are voided rather than charged. `resumes_at` hands the restart
 * back to Stripe; the resulting `customer.subscription.updated` is what returns
 * the Autumn cusProduct to active.
 */
export const buildStripeSubscriptionPauseAction = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): StripeSubscriptionAction | undefined => {
	const { stripeSubscription, pauseAction, pauseUntilMs } = billingContext;

	if (!pauseAction || !stripeSubscription) return undefined;

	const pauseCollection: Stripe.SubscriptionUpdateParams.PauseCollection | null =
		pauseAction === "pause"
			? {
					behavior: "void",
					...(pauseUntilMs !== undefined && {
						resumes_at: msToSeconds(pauseUntilMs),
					}),
				}
			: null;

	return {
		type: "update" as const,
		stripeSubscriptionId: stripeSubscription.id,
		params: buildStripeSubscriptionUpdateParams({
			params: {
				pause_collection: pauseCollection,
				proration_behavior: "none",
			},
			subscriptionParams: billingContext.subscriptionParams,
		}),
	};
};
