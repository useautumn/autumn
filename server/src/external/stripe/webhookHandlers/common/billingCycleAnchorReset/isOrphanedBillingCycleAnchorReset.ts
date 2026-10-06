import type { FullCusProduct } from "@autumn/shared";
import { isBillingCycleAnchorResetScheduled } from "@/external/stripe/subscriptionSchedules/utils/isBillingCycleAnchorResetScheduled";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";

/** A reset still to come that Stripe's schedule no longer carries, e.g. after a release: Stripe will never reset there. */
export const isOrphanedBillingCycleAnchorReset = ({
	customerProduct,
	stripeSubscription,
	nowMs,
}: {
	customerProduct: Pick<FullCusProduct, "billing_cycle_anchor_resets_at">;
	stripeSubscription: Pick<ExpandedStripeSubscription, "schedule">;
	nowMs: number;
}): boolean => {
	const resetsAt = customerProduct.billing_cycle_anchor_resets_at;
	if (typeof resetsAt !== "number" || resetsAt <= nowMs) return false;

	return !isBillingCycleAnchorResetScheduled({
		resetsAt,
		stripeSubscriptionSchedule: stripeSubscription.schedule,
	});
};
