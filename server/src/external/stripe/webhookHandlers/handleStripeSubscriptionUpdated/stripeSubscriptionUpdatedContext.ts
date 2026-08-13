import type Stripe from "stripe";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import type { BillingChangeCollector } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/billingChangeCollector";

/**
 * Previous attributes from Stripe subscription.updated event.
 * Only contains fields that changed - all fields are optional.
 */
export interface SubscriptionPreviousAttributes {
	status?: Stripe.Subscription.Status;
	latest_invoice?: string | Stripe.Invoice | null;
	cancel_at_period_end?: boolean;
	cancel_at?: number | null;
	canceled_at?: number | null;
	items?: Stripe.ApiList<Stripe.SubscriptionItem>;
}

export interface StripeSubscriptionUpdatedContext
	extends BillingChangeCollector {
	stripeSubscription: ExpandedStripeSubscription;
	previousAttributes: SubscriptionPreviousAttributes;
	/** Current time in ms, respecting test clocks */
	nowMs: number;
	/**
	 * Tracks one-off prepaid lifetime cusEnts persisted by
	 * `customerProductActions.preserveOneOffPrepaid` as each outgoing cusProduct
	 * is expired. Surfaced in the structured summary by logCustomerProductUpdates.
	 */
	oneOffPrepaidCarryOvers: {
		customerProductId: string;
		productName: string;
		preservedCount: number;
		preservedFeatureIds: string[];
	}[];
}
