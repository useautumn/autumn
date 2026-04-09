import type { BillingContext, StripeSubscriptionAction } from "@autumn/shared";
import { getTrialStateTransition } from "@/internal/billing/v2/utils/billingContext/getTrialStateTransition";

export const willStripeSubscriptionUpdateCreateInvoice = ({
	billingContext,
	stripeSubscriptionAction,
}: {
	billingContext: BillingContext;
	stripeSubscriptionAction?: StripeSubscriptionAction;
}): boolean => {
	const actionType = stripeSubscriptionAction?.type;
	if (actionType !== "update") return false;

	// if (
	// 	billingContext.requestedBillingCycleAnchor !== undefined &&
	// 	billingContext.billingCycleAnchorMs === "now"
	// ) {
	// 	return true;
	// }

	const { isTrialing, willBeTrialing } = getTrialStateTransition({
		billingContext,
	});

	if (isTrialing && !willBeTrialing) return true;

	return false;
};
