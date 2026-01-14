import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { StripeSubscriptionAction } from "@/internal/billing/v2/types/billingPlan";
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

	const { isTrialing, willBeTrialing } = getTrialStateTransition({
		billingContext,
	});

	if (isTrialing && !willBeTrialing) return true;

	return false;
};
