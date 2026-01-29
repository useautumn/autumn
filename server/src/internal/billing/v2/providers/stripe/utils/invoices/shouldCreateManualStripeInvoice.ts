import type { BillingContext } from "@autumn/shared";
import { willStripeSubscriptionUpdateCreateInvoice } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/willStripeSubscriptionUpdateCreateInvoice";
import type { StripeSubscriptionAction } from "@autumn/shared";

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
