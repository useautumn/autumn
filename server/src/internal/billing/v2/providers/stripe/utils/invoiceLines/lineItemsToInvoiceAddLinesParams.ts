import { atmnToStripeAmount, type LineItem, msToSeconds } from "@autumn/shared";
import type Stripe from "stripe";
import { lineItemToMetadata } from "./lineItemToMetadata";

/**
 * Converts a single LineItem to Stripe.InvoiceAddLinesParams.Line
 *
 * Uses effectivePeriod (the actual period being charged/refunded) for Stripe,
 * which accounts for mid-cycle changes.
 */
const toStripeAddLineParams = ({
	lineItem,
}: {
	lineItem: LineItem;
}): Stripe.InvoiceAddLinesParams.Line => {
	const { finalAmount, description, context } = lineItem;
	const { effectivePeriod, currency } = context;

	const isNegative = finalAmount < 0;
	const stripeProductId = context.product.processor?.id ?? "";
	const shouldUsePriceData = !isNegative && stripeProductId;

	return {
		description,
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
		discountable: false,
		period: effectivePeriod
			? {
					start: msToSeconds(effectivePeriod.start),
					end: msToSeconds(effectivePeriod.end),
				}
			: undefined,
	};
};

/**
 * Converts an array of LineItems to Stripe.InvoiceAddLinesParams.Line[]
 */
export const lineItemsToInvoiceAddLinesParams = ({
	lineItems,
}: {
	lineItems: LineItem[];
}): Stripe.InvoiceAddLinesParams.Line[] => {
	return lineItems.map((lineItem) => toStripeAddLineParams({ lineItem }));
};
