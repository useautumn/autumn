import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import { isStripeSubscriptionCanceling } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { notNullish, nullish } from "@/utils/genUtils";
import type { SubscriptionPreviousAttributes } from "../../stripeSubscriptionUpdatedContext";

interface RenewalInfo {
	renewed: boolean;
	renewedAtMs: number;
}

export const isStripeSubscriptionRenewedEvent = ({
	stripeSubscription,
	previousAttributes,
}: {
	stripeSubscription: ExpandedStripeSubscription;
	previousAttributes?: SubscriptionPreviousAttributes;
}): RenewalInfo => {
	if (!previousAttributes) {
		return { renewed: false, renewedAtMs: Date.now() };
	}
	const uncanceledAtPeriodEnd =
		previousAttributes.cancel_at_period_end &&
		!stripeSubscription.cancel_at_period_end;

	const uncancelAt =
		notNullish(previousAttributes.cancel_at) &&
		nullish(stripeSubscription.cancel_at);

	const uncanceledAt =
		notNullish(previousAttributes.canceled_at) &&
		nullish(stripeSubscription.canceled_at);

	const stillCanceling = isStripeSubscriptionCanceling(stripeSubscription);

	return {
		renewed:
			!stillCanceling && !!(uncanceledAtPeriodEnd || uncancelAt || uncanceledAt),
		renewedAtMs: Date.now(),
	};
};
