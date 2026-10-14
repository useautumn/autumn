import type { CreateScheduleBillingContext } from "@autumn/shared";
import { billingCycleAnchorToApply } from "./billingCycleAnchorToApply";
import { replacementReason } from "./replacementReason";

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
