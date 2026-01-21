import { type FullCustomer, secondsToMs } from "@autumn/shared";
import type Stripe from "stripe";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import type { BillingContext } from "@/internal/billing/v2/billingContext";

/**
 * Builds a minimal BillingContext from webhook context data.
 * Used for generating arrear line items when a subscription is deleted.
 */
export const buildBillingContextFromWebhook = ({
	stripeSubscription,
	fullCustomer,
	nowMs,
	paymentMethod,
}: {
	stripeSubscription: ExpandedStripeSubscription;
	fullCustomer: FullCustomer;
	nowMs: number;
	paymentMethod?: Stripe.PaymentMethod | null;
}): BillingContext => {
	return {
		fullCustomer,
		fullProducts: [],
		featureQuantities: [],

		currentEpochMs: nowMs,
		billingCycleAnchorMs: secondsToMs(stripeSubscription.billing_cycle_anchor),
		resetCycleAnchorMs: secondsToMs(stripeSubscription.billing_cycle_anchor),

		stripeCustomer: stripeSubscription.customer,
		stripeSubscription,
		paymentMethod: paymentMethod ?? undefined,
	};
};
