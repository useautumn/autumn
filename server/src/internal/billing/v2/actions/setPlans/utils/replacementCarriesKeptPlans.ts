import type { CreateScheduleBillingContext } from "@autumn/shared";

/**
 * The new subscription takes over the replaced one's kept plans on a date instead of restarting them:
 * a canceled subscription's paid-up period runs to its end, an ended trial's to the requested anchor.
 */
export const replacementCarriesKeptPlans = ({
	billingContext,
}: {
	billingContext: Pick<
		CreateScheduleBillingContext,
		"replacedStripeSubscription" | "requestedBillingCycleAnchor"
	>;
}) => {
	const { replacedStripeSubscription, requestedBillingCycleAnchor } =
		billingContext;
	if (replacedStripeSubscription?.status === "canceled") {
		return requestedBillingCycleAnchor === undefined;
	}
	return (
		replacedStripeSubscription?.status === "trialing" &&
		typeof requestedBillingCycleAnchor === "number"
	);
};
