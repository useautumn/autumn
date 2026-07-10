import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import { isStripeSubscriptionCanceling } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { notNullish, nullish } from "@/utils/genUtils";
import type { SubscriptionPreviousAttributes } from "../../stripeSubscriptionUpdatedContext";

interface RenewalInfo {
	renewed: boolean;
	renewedAtMs: number;
}

/**
 * Detects if a subscription.updated event represents a renewal (un-cancellation).
 * A renewal occurs when a previously canceled subscription is un-canceled.
 */
export const isStripeSubscriptionRenewedEvent = ({
	stripeSubscription,
	previousAttributes,
}: {
	stripeSubscription: ExpandedStripeSubscription;
	previousAttributes?: SubscriptionPreviousAttributes;
}): RenewalInfo => {
	// If no previous attributes, we can't determine if this is a renewal
	if (!previousAttributes) {
		return { renewed: false, renewedAtMs: Date.now() };
	}
	// Un-canceled at period end
	const uncanceledAtPeriodEnd =
		previousAttributes.cancel_at_period_end &&
		!stripeSubscription.cancel_at_period_end;

	// cancel_at was set, now cleared
	const uncancelAt =
		notNullish(previousAttributes.cancel_at) &&
		nullish(stripeSubscription.cancel_at);

	// canceled_at was set, now cleared
	const uncanceledAt =
		notNullish(previousAttributes.canceled_at) &&
		nullish(stripeSubscription.canceled_at);

	// Duplicate cancel calls can wiggle individual cancel fields (e.g. switch
	// cancel_at_period_end to an explicit cancel_at) — never a renewal.
	const stillCanceling = isStripeSubscriptionCanceling(stripeSubscription);

	return {
		renewed:
			!stillCanceling && !!(uncanceledAtPeriodEnd || uncancelAt || uncanceledAt),
		renewedAtMs: Date.now(),
	};
};
