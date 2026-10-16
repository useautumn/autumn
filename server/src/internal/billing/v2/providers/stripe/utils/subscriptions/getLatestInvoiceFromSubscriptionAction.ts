import type { BillingContext, StripeSubscriptionAction } from "@autumn/shared";
import type Stripe from "stripe";
import { willStripeSubscriptionUpdateCreateInvoice } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/willStripeSubscriptionUpdateCreateInvoice";

/**
 * Returns the latest invoice from a subscription action if one was created.
 * Only create actions and updates that trigger proration generate an invoice.
 */
export const getLatestInvoiceFromSubscriptionAction = ({
	stripeSubscription,
	subscriptionAction,
	billingContext,
}: {
	stripeSubscription: Stripe.Subscription;
	subscriptionAction: StripeSubscriptionAction;
	billingContext: BillingContext;
}): Stripe.Invoice | undefined => {
	const isCreateAction = subscriptionAction.type === "create";
	const updateWillCreateInvoice = willStripeSubscriptionUpdateCreateInvoice({
		billingContext,
		stripeSubscriptionAction: subscriptionAction,
	});

	if (isCreateAction || updateWillCreateInvoice) {
		return stripeSubscription.latest_invoice as Stripe.Invoice;
	}

	return undefined;
};
