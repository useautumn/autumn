import type { BillingContext } from "@autumn/shared";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { subscriptionStateAction } from "./subscriptionStateAction";

/**
 * A healthy paid subscription is being recreated from a backdated start; it is already paid through its period end.
 * A trialing one paid nothing, so its recreate bills like a new subscription's backdate instead.
 */
export const isBackdateRecreate = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		"replacedStripeSubscription" | "subscriptionBackdateStartMs"
	>;
}) => {
	const { replacedStripeSubscription, subscriptionBackdateStartMs } =
		billingContext;
	if (!replacedStripeSubscription) return false;
	if (subscriptionBackdateStartMs === undefined) return false;
	if (isStripeSubscriptionTrialing(replacedStripeSubscription)) return false;

	return (
		subscriptionStateAction({ state: replacedStripeSubscription.status })
			.action === "update"
	);
};
