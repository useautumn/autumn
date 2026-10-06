import { type FullCusProduct, secondsToMs } from "@autumn/shared";
import { isBillingCycleAnchorResetScheduled } from "@/external/stripe/subscriptionSchedules/utils/isBillingCycleAnchorResetScheduled.js";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/index.js";
import type { SchedulePhaseProration } from "@/internal/billing/v2/providers/stripe/setup/resolveSchedulePhaseProrations.js";

/**
 * A scheduled anchor reset still pending on the subscription's Stripe schedule, and the phases that skip proration.
 * The next-cycle preview needs both to show the anchor's invoice instead of the old renewal.
 */
export const setupInvoicePreviewPendingAnchor = ({
	customerProducts,
	stripeSubscription,
	nowMs,
}: {
	customerProducts: FullCusProduct[];
	stripeSubscription: ExpandedStripeSubscription;
	nowMs: number;
}): {
	pendingBillingCycleAnchorMs: number | undefined;
	schedulePhaseProrations: SchedulePhaseProration[];
} => {
	const stripeSubscriptionSchedule = stripeSubscription.schedule;

	// A saved reset counts only while Stripe's schedule still restarts the cycle then (a released schedule doesn't).
	const pendingAnchors = customerProducts
		.map((customerProduct) => customerProduct.billing_cycle_anchor_resets_at)
		.filter(
			(resetsAt): resetsAt is number =>
				typeof resetsAt === "number" &&
				resetsAt > nowMs &&
				isBillingCycleAnchorResetScheduled({
					resetsAt,
					stripeSubscriptionSchedule,
				}),
		)
		.sort((a, b) => a - b);

	// Only `none` changes what a phase start bills; Stripe's other behaviours credit unused time like the default.
	const schedulePhaseProrations = (stripeSubscriptionSchedule?.phases ?? [])
		.filter((phase) => phase.proration_behavior === "none")
		.map((phase) => ({
			startsAt: secondsToMs(phase.start_date),
			prorationBehavior: "none" as const,
		}));

	return {
		pendingBillingCycleAnchorMs: pendingAnchors[0],
		schedulePhaseProrations,
	};
};
