import type {
	AutumnBillingPlan,
	BillingContext,
	StripeSubscriptionAction,
} from "@autumn/shared";
import { willStripeSubscriptionUpdateCreateInvoice } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/willStripeSubscriptionUpdateCreateInvoice";

export const shouldCreateManualStripeInvoice = ({
	billingContext,
	autumnBillingPlan,
	stripeSubscriptionAction,
}: {
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	stripeSubscriptionAction?: StripeSubscriptionAction;
}): boolean => {
	const isCreateAction = stripeSubscriptionAction?.type === "create";
	if (isCreateAction) return false;

	const { stripeSubscription } = billingContext;
	if (!stripeSubscription) {
		const lineItems = autumnBillingPlan.lineItems;
		const totalAmount =
			lineItems?.reduce((acc, lineItem) => acc + lineItem.finalAmount, 0) ?? 0;

		return totalAmount !== 0;
	}

	const updateWillCreateInvoice = willStripeSubscriptionUpdateCreateInvoice({
		billingContext,
		stripeSubscriptionAction,
	});

	if (updateWillCreateInvoice) return false;

	return true;
};
