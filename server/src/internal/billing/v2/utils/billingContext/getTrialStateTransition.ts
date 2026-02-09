import type { BillingContext } from "@autumn/shared";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { billingContextHasTrial } from "./billingContextHasTrial";

/** Gets the trial state transition for a billing context. */
export const getTrialStateTransition = ({
	billingContext,
}: {
	billingContext: BillingContext;
}) => {
	const isTrialing = isStripeSubscriptionTrialing(
		billingContext.stripeSubscription,
	);

	const willBeTrialing = billingContextHasTrial({ billingContext, isTrialing });

	return { isTrialing, willBeTrialing };
};
