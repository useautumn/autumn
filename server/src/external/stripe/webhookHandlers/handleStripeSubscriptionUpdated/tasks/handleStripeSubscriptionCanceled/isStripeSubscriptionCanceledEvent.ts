import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import { nullish } from "@/utils/genUtils";
import type { SubscriptionPreviousAttributes } from "../../stripeSubscriptionUpdatedContext";

interface CancellationInfo {
	canceled: boolean;
	canceledAtMs: number | null;
	cancelsAtMs: number | null;
}

/**
 * Detects if a subscription.updated event represents a new cancellation
 * by comparing previous attributes. Returns cancellation timing info.
 */
export const isStripeSubscriptionCanceledEvent = ({
	stripeSubscription,
	previousAttributes,
}: {
	stripeSubscription: ExpandedStripeSubscription;
	previousAttributes?: SubscriptionPreviousAttributes;
}): CancellationInfo => {
	// If no previous attributes, we can't determine if this is a new cancellation
	if (!previousAttributes) {
		return { canceled: false, canceledAtMs: null, cancelsAtMs: null };
	}
	// Not canceled if neither cancel_at nor cancel_at_period_end is set
	if (
		!stripeSubscription.cancel_at &&
		!stripeSubscription.cancel_at_period_end
	) {
		return { canceled: false, canceledAtMs: null, cancelsAtMs: null };
	}

	// Check if this event represents a new cancellation
	const cancelAtPeriodEndChanged =
		!previousAttributes.cancel_at_period_end &&
		stripeSubscription.cancel_at_period_end;

	const cancelAtChanged =
		nullish(previousAttributes.cancel_at) && stripeSubscription.cancel_at;

	const canceledAtChanged =
		nullish(previousAttributes.canceled_at) && stripeSubscription.canceled_at;

	const canceled =
		cancelAtPeriodEndChanged || cancelAtChanged || canceledAtChanged;

	return {
		canceled: !!canceled,
		canceledAtMs: stripeSubscription.canceled_at
			? stripeSubscription.canceled_at * 1000
			: Date.now(),
		cancelsAtMs: stripeSubscription.cancel_at
			? stripeSubscription.cancel_at * 1000
			: null,
	};
};
