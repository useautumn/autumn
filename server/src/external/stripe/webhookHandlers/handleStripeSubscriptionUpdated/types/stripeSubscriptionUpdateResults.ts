import type { FullCustomer, Subscription } from "@autumn/shared";
import type Stripe from "stripe";
import type { SyncV2Result } from "@/internal/billing/v2/actions/sync/syncV2";

export type StripeSubscriptionUpdateResults = {
	subscription?: Subscription | null;
	repairedCustomerProducts?: { id: string; internal_customer_id: string }[];
	autoSync?: SyncV2Result;
	pooledBalances?: FullCustomer;
	stripeSubscription?: Stripe.Subscription;
	errors: unknown[];
};
