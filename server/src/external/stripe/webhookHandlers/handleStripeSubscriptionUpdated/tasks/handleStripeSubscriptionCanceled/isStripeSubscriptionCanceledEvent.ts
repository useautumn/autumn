import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import { nullish } from "@/utils/genUtils";
import type { SubscriptionPreviousAttributes } from "../../stripeSubscriptionUpdatedContext";

interface CancellationInfo {
	canceled: boolean;
	canceledAtMs: number | null;
	cancelsAtMs: number | null;
}

export const isStripeSubscriptionCanceledEvent = ({
	stripeSubscription,
	previousAttributes,
}: {
	stripeSubscription: ExpandedStripeSubscription;
	previousAttributes?: SubscriptionPreviousAttributes;
}): CancellationInfo => {
	if (!previousAttributes) {
		return { canceled: false, canceledAtMs: null, cancelsAtMs: null };
	}
	if (
		!stripeSubscription.cancel_at &&
		!stripeSubscription.cancel_at_period_end
	) {
		return { canceled: false, canceledAtMs: null, cancelsAtMs: null };
	}

	const cancelAtPeriodEndChanged =
		"cancel_at_period_end" in previousAttributes &&
		!previousAttributes.cancel_at_period_end &&
		stripeSubscription.cancel_at_period_end;

	const cancelAtChanged =
		"cancel_at" in previousAttributes &&
		nullish(previousAttributes.cancel_at) &&
		stripeSubscription.cancel_at;

	const canceledAtChanged =
		"canceled_at" in previousAttributes &&
		nullish(previousAttributes.canceled_at) &&
		stripeSubscription.canceled_at;

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
