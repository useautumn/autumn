import type {
	FullCusProduct,
	FullCustomer,
	InsertCustomerProduct,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import type { StripeSubscriptionUpdateResults } from "./types/stripeSubscriptionUpdateResults";

export interface SubscriptionPreviousAttributes {
	status?: Stripe.Subscription.Status;
	latest_invoice?: string | Stripe.Invoice | null;
	cancel_at_period_end?: boolean;
	cancel_at?: number | null;
	canceled_at?: number | null;
	trial_end?: number | null;
	collection_method?: Stripe.Subscription.CollectionMethod;
	items?: Stripe.ApiList<Stripe.SubscriptionItem>;
}

export interface StripeSubscriptionUpdatedContext {
	stripeSubscription: ExpandedStripeSubscription;
	previousAttributes: SubscriptionPreviousAttributes;
	fullCustomer: FullCustomer;
	customerProducts: FullCusProduct[];
	nowMs: number;
	results: StripeSubscriptionUpdateResults;

	updatedCustomerProducts: {
		customerProduct: FullCusProduct;
		updates: Partial<InsertCustomerProduct>;
	}[];
	deletedCustomerProducts: FullCusProduct[];
	insertedCustomerProducts: FullCusProduct[];
	oneOffPrepaidCarryOvers: {
		customerProductId: string;
		productName: string;
		preservedCount: number;
		preservedFeatureIds: string[];
	}[];
	billingChangeTags: Set<string>;
}
