import type { FullCusProduct } from "@autumn/shared";
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
	/**
	 * Mutable list of customer products. Updated in place by the
	 * `trackCustomerProduct{Update,Deletion,Insertion}` helpers so subsequent
	 * tasks see the current state. Callers iterating this array while those
	 * helpers may run (directly or transitively) must iterate over a snapshot,
	 * e.g. `for (const cp of [...customerProducts])`, to avoid iterator
	 * invalidation.
	 */
	customerProducts: FullCusProduct[];
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
