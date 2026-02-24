import { atmnToStripeAmount, type LineItem, msToSeconds } from "@autumn/shared";
import type Stripe from "stripe";
import { lineItemToMetadata } from "./lineItemToMetadata";

/**
 * Converts a single LineItem to Stripe.InvoiceItemCreateParams
 */
const toStripeCreateInvoiceItemParams = ({
	stripeCustomerId,
	stripeSubscriptionId,
	stripeInvoiceId,
	lineItem,
}: {
	stripeCustomerId: string;
	stripeSubscriptionId?: string;
	stripeInvoiceId?: string;
	lineItem: LineItem;
}): Stripe.InvoiceItemCreateParams => {
	const { finalAmount, description, context } = lineItem;
	const { billingPeriod, currency } = context;

	const isNegative = finalAmount < 0;
	const stripeProductId = context.product.processor?.id ?? "";
	const shouldUsePriceData = !isNegative && stripeProductId;

	return {
		customer: stripeCustomerId,
		subscription: stripeSubscriptionId,
		invoice: stripeInvoiceId,

		amount: shouldUsePriceData
			? undefined
			: atmnToStripeAmount({ amount: finalAmount }),

		price_data: shouldUsePriceData
			? {
					unit_amount: atmnToStripeAmount({ amount: finalAmount }),
					currency,
					product: stripeProductId,
				}
			: undefined,
		metadata: lineItemToMetadata({ lineItem }),
		currency,
		description,
		discountable: false,
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
	stripeInvoiceId,
	lineItems,
}: {
	stripeCustomerId: string;
	stripeSubscriptionId?: string;
	stripeInvoiceId?: string;
	lineItems: LineItem[];
}): Stripe.InvoiceItemCreateParams[] => {
	return lineItems.map((lineItem) =>
		toStripeCreateInvoiceItemParams({
			stripeCustomerId,
			stripeSubscriptionId,
			stripeInvoiceId,
			lineItem,
		}),
	);
};
