import type { CreateScheduleBillingContext } from "@autumn/shared";
import { billingCycleAnchorToApply } from "./billingCycleAnchorToApply";
import { replacementReason } from "./replacementReason";

/**
 * The new subscription takes over the replaced one's kept plans on a date instead of restarting them: a canceled
 * subscription's paid-up period runs to its end, an ended trial's to the anchor it applies, a backdated trial's from its start.
 */
export const replacementCarriesKeptPlans = ({
	billingContext,
}: {
	billingContext: Pick<
		CreateScheduleBillingContext,
		| "replacedStripeSubscription"
		| "requestedBillingCycleAnchor"
		| "subscriptionBackdateStartMs"
		| "trialEndAnchorMs"
	>;
}) => {
	switch (replacementReason({ billingContext })) {
		case "canceled":
			return billingContext.requestedBillingCycleAnchor === undefined;
		case "trialBackdate":
			return true;
		case "trialing":
			return typeof billingCycleAnchorToApply({ billingContext }) === "number";
		default:
			return false;
	}
};
