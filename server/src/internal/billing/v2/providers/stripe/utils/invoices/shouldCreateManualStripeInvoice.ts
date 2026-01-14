import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { willStripeSubscriptionUpdateCreateInvoice } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/willStripeSubscriptionUpdateCreateInvoice";
import type { StripeSubscriptionAction } from "@/internal/billing/v2/types/billingPlan";

export const shouldCreateManualStripeInvoice = ({
	billingContext,
	stripeSubscriptionAction,
}: {
	billingContext: BillingContext;
	stripeSubscriptionAction?: StripeSubscriptionAction;
}): boolean => {
	const isCreateAction = stripeSubscriptionAction?.type === "create";
	if (isCreateAction) return false;

	const { stripeSubscription } = billingContext;
	if (!stripeSubscription) return false;

	const updateWillCreateInvoice = willStripeSubscriptionUpdateCreateInvoice({
		billingContext,
		stripeSubscriptionAction,
	});

	if (updateWillCreateInvoice) return false;

	return true;
};
