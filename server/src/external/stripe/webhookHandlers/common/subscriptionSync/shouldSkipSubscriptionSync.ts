import type { FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import { isAutumnManagedSubscriptionMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";

export type SkipSubscriptionSyncResult =
	| { skip: false }
	| { skip: true; reason: string };

/**
 * Decides whether a Stripe subscription webhook (created/updated) should be
 * auto-synced back to Autumn or skipped because Autumn already owns the change.
 *
 * Skip when:
 *   1. The subscription metadata is flagged Autumn-managed (`autumn_managed=true`),
 *      or has a recent `autumn_managed_at` timestamp inside the action window.
 *   2. The customer already has an Autumn customerProduct linked to this Stripe
 *      subscription (defensive check against the metadata-not-yet-written race).
 */
export const shouldSkipSubscriptionSync = ({
	subscription,
	fullCustomer,
}: {
	subscription: Stripe.Subscription;
	fullCustomer: FullCustomer;
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
	});
	if (metadataDecision.skip) {
		return { skip: true, reason: metadataDecision.reason ?? "autumn metadata" };
	}

	return { skip: false };
};
