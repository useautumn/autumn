import type { CreateScheduleBillingContext } from "@autumn/shared";
import { isTrialBackdateRecreate } from "./isTrialBackdateRecreate";

/**
 * The new subscription takes over the replaced one's kept plans on a date instead of restarting them: a canceled
 * subscription's paid-up period runs to its end, an ended trial's to the requested anchor, a backdated trial's from its start.
 */
export const replacementCarriesKeptPlans = ({
	billingContext,
}: {
	billingContext: Pick<
		CreateScheduleBillingContext,
		| "replacedStripeSubscription"
		| "requestedBillingCycleAnchor"
		| "subscriptionBackdateStartMs"
	>;
}) => {
	const { replacedStripeSubscription, requestedBillingCycleAnchor } =
		billingContext;
	if (replacedStripeSubscription?.status === "canceled") {
		return requestedBillingCycleAnchor === undefined;
	}
	if (isTrialBackdateRecreate({ billingContext })) return true;
	return (
		replacedStripeSubscription?.status === "trialing" &&
		typeof requestedBillingCycleAnchor === "number"
	);
};
