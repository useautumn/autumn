import type { BillingContext, FullCusProduct } from "@autumn/shared";
import { isBillingCycleAnchorResetScheduled } from "@/external/stripe/subscriptionSchedules/utils/isBillingCycleAnchorResetScheduled";

/** A stale billing_cycle_anchor_resets_at (e.g. a released schedule) is not a reset Stripe will bill. */
export const pendingAnchorResets = ({
	billingContext,
	customerProducts,
	nowMs,
}: {
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
	nowMs: number;
}): number[] => [
	...new Set(
		customerProducts.flatMap(({ billing_cycle_anchor_resets_at: resetsAt }) =>
			resetsAt != null &&
			resetsAt > nowMs &&
			isBillingCycleAnchorResetScheduled({
				resetsAt,
				stripeSubscriptionSchedule: billingContext.stripeSubscriptionSchedule,
			})
				? [resetsAt]
				: [],
		),
	),
];
