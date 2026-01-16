import { atmnToStripeAmount, type LineItem, msToSeconds } from "@autumn/shared";
import type Stripe from "stripe";

/**
 * Converts a single LineItem to Stripe.InvoiceItemCreateParams
 */
const toStripeCreateInvoiceItemParams = ({
	stripeCustomerId,
	stripeSubscriptionId,
	lineItem,
}: {
	stripeCustomerId: string;
	stripeSubscriptionId?: string;
	lineItem: LineItem;
}): Stripe.InvoiceItemCreateParams => {
	const { finalAmount, description, context } = lineItem;
	const { billingPeriod, currency } = context;

	return {
		customer: stripeCustomerId,
		subscription: stripeSubscriptionId,
		amount: atmnToStripeAmount({ amount: finalAmount }),
		currency,
		description,
		period: billingPeriod
			? {
					start: msToSeconds(billingPeriod.start),
					end: msToSeconds(billingPeriod.end),
				}
			: undefined,
	};
};

/**
 * Converts an array of LineItems to Stripe.InvoiceItemCreateParams[]
 */
export const lineItemsToCreateInvoiceItemsParams = ({
	stripeCustomerId,
	stripeSubscriptionId,
	lineItems,
}: {
	stripeCustomerId: string;
	stripeSubscriptionId?: string;
	lineItems: LineItem[];
}): Stripe.InvoiceItemCreateParams[] => {
	return lineItems.map((lineItem) =>
		toStripeCreateInvoiceItemParams({
			stripeCustomerId,
			stripeSubscriptionId,
			lineItem,
		}),
	);
};
