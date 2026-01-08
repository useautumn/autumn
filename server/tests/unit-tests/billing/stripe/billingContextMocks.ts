import type { FullCusProduct, FullProduct } from "@autumn/shared";
import {
	createMockFullCustomer,
	createMockStripeCustomer,
} from "@tests/utils/mockUtils/customerMocks";
import type Stripe from "stripe";
import type { BillingContext } from "@/internal/billing/v2/billingContext";

export const createMockBillingContext = ({
	customerProducts = [],
	fullProducts = [],
	stripeSubscription,
	stripeSubscriptionSchedule,
	currentEpochMs = Date.now(),
	billingCycleAnchorMs = "now",
	resetCycleAnchorMs = "now",
}: {
	customerProducts?: FullCusProduct[];
	fullProducts?: FullProduct[];
	stripeSubscription?: Stripe.Subscription;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
	currentEpochMs?: number;
	billingCycleAnchorMs?: number | "now";
	resetCycleAnchorMs?: number | "now";
}): BillingContext => ({
	fullCustomer: createMockFullCustomer({ customerProducts }),
	stripeCustomer: createMockStripeCustomer(),
	fullProducts,
	featureQuantities: [],
	currentEpochMs,
	billingCycleAnchorMs,
	resetCycleAnchorMs,
	stripeSubscription,
	stripeSubscriptionSchedule,
	customPrices: [],
	customEnts: [],
});
