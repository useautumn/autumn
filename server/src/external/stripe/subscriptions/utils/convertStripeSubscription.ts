import { CusProductStatus, secondsToMs } from "@autumn/shared";
import type Stripe from "stripe";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import { stripeTestClockToNowMs } from "@/external/stripe/testClocks/utils/convertStripeTestClock";

/**
 * Maps Stripe subscription status to Autumn CusProductStatus.
 *
 * Stripe subscription statuses:
 * - trialing: Customer is in trial period. Transitions to active after first payment.
 * - active: Subscription is in good standing.
 * - incomplete: Customer has 23 hours to make successful payment to activate.
 * - incomplete_expired: Initial payment failed and customer didn't pay within 23 hours. Terminal state.
 * - past_due: Payment on latest invoice failed. Subscription continues creating invoices.
 * - canceled: Subscription was cancelled. Terminal state.
 * - unpaid: Latest invoice hasn't been paid but subscription remains in place.
 * - paused: Trial ended without payment method. Invoices no longer created.
 */
export const stripeSubscriptionToAutumnStatus = ({
	stripeStatus,
}: {
	stripeStatus: Stripe.Subscription.Status;
}): CusProductStatus => {
	switch (stripeStatus) {
		// Active states - subscription is valid and usable
		case "trialing":
		case "active":
			return CusProductStatus.Active;

		// Payment issue states - subscription exists but needs attention
		case "incomplete":
		case "past_due":
		case "unpaid":
		case "paused":
			return CusProductStatus.PastDue;

		// Terminal states - subscription is no longer active
		case "incomplete_expired":
		case "canceled":
			return CusProductStatus.Expired;

		default:
			// Unknown status - return unknown status
			return CusProductStatus.Unknown;
	}
};

/**
 * Gets the trial ends at in milliseconds for a Stripe subscription.
 */
export const stripeSubscriptionToTrialEndsAtMs = ({
	stripeSubscription,
}: {
	stripeSubscription: ExpandedStripeSubscription;
}) => {
	if (stripeSubscription.schedule) {
		let latestTrialEndsAt: number | undefined;
		for (const phase of stripeSubscription.schedule.phases) {
			if (phase.trial_end) {
				latestTrialEndsAt = phase.trial_end;
			}
		}
		return latestTrialEndsAt ? secondsToMs(latestTrialEndsAt) : undefined;
	}

	return stripeSubscription.trial_end
		? secondsToMs(stripeSubscription.trial_end)
		: undefined;
};

/**
 * Gets the latest invoice for a Stripe subscription.
 * Handles both expanded (object) and unexpanded (string ID) cases.
 */
export const stripeSubscriptionToLatestInvoice = async ({
	stripeSubscription,
	stripeCli,
}: {
	stripeSubscription: ExpandedStripeSubscription;
	stripeCli: Stripe;
}): Promise<Stripe.Invoice | null> => {
	if (!stripeSubscription.latest_invoice) return null;

	// If already expanded, return directly
	if (typeof stripeSubscription.latest_invoice !== "string") {
		return stripeSubscription.latest_invoice;
	}

	// Otherwise fetch
	return await stripeCli.invoices.retrieve(stripeSubscription.latest_invoice);
};

/**
 * Gets the current time in milliseconds for a Stripe subscription, respecting test clocks.
 * Checks subscription.test_clock first, then falls back to customer.test_clock.
 */
export const stripeSubscriptionToNowMs = async ({
	stripeSubscription,
	stripeCli,
}: {
	stripeSubscription: Stripe.Subscription;
	stripeCli: Stripe;
}): Promise<number> => {
	if (stripeSubscription.livemode) {
		return Date.now();
	}

	// Check subscription's test_clock first (only in test mode)
	if (stripeSubscription.test_clock) {
		return stripeTestClockToNowMs({
			stripeCli,
			testClock: stripeSubscription.test_clock,
		});
	}

	// Fall back to customer's test_clock
	if (
		stripeSubscription.customer &&
		typeof stripeSubscription.customer !== "string" &&
		"test_clock" in stripeSubscription.customer
	) {
		const customerTestClock = stripeSubscription.customer.test_clock;

		return stripeTestClockToNowMs({
			stripeCli,
			testClock: customerTestClock ?? undefined,
		});
	}

	return Date.now();
};

export const stripeSubscriptionToScheduleId = ({
	stripeSubscription,
}: {
	stripeSubscription: ExpandedStripeSubscription;
}): string | null => {
	return typeof stripeSubscription.schedule === "string"
		? stripeSubscription.schedule
		: (stripeSubscription.schedule?.id ?? null);
};
