import {
	type AutumnBillingPlan,
	type BillingContext,
	type StripeSubscriptionAction,
	sumValues,
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

	// Custom line items always need a manual invoice
	const customLineItems = autumnBillingPlan.customLineItems;
	if (customLineItems?.length) {
		const customTotal = sumValues(customLineItems.map((item) => item.amount));
		return customTotal !== 0;
	}

	const { stripeSubscription } = billingContext;
	if (!stripeSubscription) {
		const lineItems = autumnBillingPlan.lineItems;
		const totalAmount = lineItems
			? sumValues(lineItems.map((li) => li.amountAfterDiscounts))
			: 0;

		return totalAmount !== 0;
	}

	const updateWillCreateInvoice = willStripeSubscriptionUpdateCreateInvoice({
		billingContext,
		stripeSubscriptionAction,
	});

	if (updateWillCreateInvoice) return false;

	return true;
};
