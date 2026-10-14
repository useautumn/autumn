import type { FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import { isAutumnManagedSubscriptionMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";

export type SkipSubscriptionSyncResult =
	| { skip: false }
	| { skip: true; reason: string };

export const shouldSkipSubscriptionSync = ({
	subscription,
	fullCustomer,
	requireRecent = true,
}: {
	subscription: Stripe.Subscription;
	fullCustomer: FullCustomer;
	requireRecent?: boolean;
}): SkipSubscriptionSyncResult => {
	const alreadyLinked = fullCustomer.customer_products?.some(
		(customerProduct) =>
			customerProduct.subscription_ids?.includes(subscription.id),
	);
	if (alreadyLinked) {
		return { skip: true, reason: "customerProduct already linked" };
	}

	const metadataDecision = isAutumnManagedSubscriptionMetadata({
		metadata: subscription.metadata,
		requireRecent,
	});
	if (metadataDecision.skip) {
		return { skip: true, reason: metadataDecision.reason ?? "autumn metadata" };
	}

	return { skip: false };
};
