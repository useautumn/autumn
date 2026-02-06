import type {
	FullCusProduct,
	FullCustomer,
	InsertCustomerProduct,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";

/**
 * Previous attributes from Stripe subscription.updated event.
 * Only contains fields that changed - all fields are optional.
 */
export interface SubscriptionPreviousAttributes {
	status?: Stripe.Subscription.Status;
	cancel_at_period_end?: boolean;
	cancel_at?: number | null;
	canceled_at?: number | null;
	items?: Stripe.ApiList<Stripe.SubscriptionItem>;
}

export interface StripeSubscriptionUpdatedContext {
	stripeSubscription: ExpandedStripeSubscription;
	previousAttributes: SubscriptionPreviousAttributes;
	fullCustomer: FullCustomer;
	/** Mutable list of customer products - can be updated in place by tasks */
	customerProducts: FullCusProduct[];
	/** Current time in ms, respecting test clocks */
	nowMs: number;

	updatedCustomerProducts: {
		customerProduct: FullCusProduct;
		updates: Partial<InsertCustomerProduct>;
	}[];
	/** Tracks all deletions made to customer products during this handler */
	deletedCustomerProducts: FullCusProduct[];
	/** Tracks all insertions (new customer products created) during this handler */
	insertedCustomerProducts: FullCusProduct[];
}
