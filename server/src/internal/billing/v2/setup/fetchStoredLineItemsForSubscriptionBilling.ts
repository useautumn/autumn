import type { FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle";
import { fetchStoredLineItemsForBilling } from "./fetchStoredLineItemsForBilling";
import { getSiblingCusProductIds } from "./getSiblingCusProductIds";

export const fetchStoredLineItemsForSubscriptionBilling = async ({
	db,
	fullCustomer,
	stripeSubscription,
	outgoingCusProductIds,
}: {
	db: DrizzleCli;
	fullCustomer: FullCustomer;
	stripeSubscription?: Stripe.Subscription;
	outgoingCusProductIds: string[];
}) => {
	const siblingIds = getSiblingCusProductIds({
		fullCustomer,
		stripeSubscription,
		excludeIds: outgoingCusProductIds,
	});
	return fetchStoredLineItemsForBilling({
		db,
		customerProductIds: [...outgoingCusProductIds, ...siblingIds],
	});
};
