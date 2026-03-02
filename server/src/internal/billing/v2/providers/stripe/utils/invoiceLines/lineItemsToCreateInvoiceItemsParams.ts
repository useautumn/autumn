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
	const { amount, amountAfterDiscounts, description, context } = lineItem;
	const { effectivePeriod, currency, discountable } = context;

	// If discountable, use amount (let Stripe apply discounts), otherwise use amountAfterDiscounts
	const lineAmount = discountable ? amount : amountAfterDiscounts;
	const isNegative = lineAmount < 0;
	const stripeProductId = context.product.processor?.id ?? "";
	const shouldUsePriceData = !isNegative && stripeProductId;

	return {
		customer: stripeCustomerId,
		subscription: stripeSubscriptionId,
		invoice: stripeInvoiceId,

		amount: shouldUsePriceData
			? undefined
			: atmnToStripeAmount({ amount: lineAmount }),

		price_data: shouldUsePriceData
			? {
					unit_amount: atmnToStripeAmount({ amount: lineAmount }),
					currency,
					product: stripeProductId,
				}
			: undefined,
		metadata: lineItemToMetadata({ lineItem }),
		currency,
		description,
		discountable: discountable ?? false,
		period: effectivePeriod
			? {
					start: msToSeconds(effectivePeriod.start),
					end: msToSeconds(effectivePeriod.end),
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
