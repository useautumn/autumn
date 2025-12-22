import type { FullCusProduct } from "@autumn/shared";
import {
	createMockFullCustomer,
	createMockStripeCustomer,
} from "@tests/utils/mockUtils/customerMocks";
import type Stripe from "stripe";
import type { BillingContext } from "@/internal/billing/v2/billingContext";

export const createMockBillingContext = ({
	customerProducts = [],
	stripeSubscription,
}: {
	customerProducts?: FullCusProduct[];
	stripeSubscription?: Stripe.Subscription;
}): BillingContext => ({
	fullCustomer: createMockFullCustomer({ customerProducts }),
	stripeCustomer: createMockStripeCustomer(),
	stripeSubscription,
});
