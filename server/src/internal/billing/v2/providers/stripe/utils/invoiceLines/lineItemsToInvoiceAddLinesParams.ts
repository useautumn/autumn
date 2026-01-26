import { atmnToStripeAmount, type LineItem, msToSeconds } from "@autumn/shared";
import type Stripe from "stripe";

/**
 * Converts a single LineItem to Stripe.InvoiceAddLinesParams.Line
 */
const toStripeAddLineParams = ({
	lineItem,
}: {
	lineItem: LineItem;
}): Stripe.InvoiceAddLinesParams.Line => {
	const { finalAmount, description, context } = lineItem;
	const { billingPeriod } = context;

	return {
		description,
		amount: atmnToStripeAmount({ amount: finalAmount }),
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
 * Converts an array of LineItems to Stripe.InvoiceAddLinesParams.Line[]
 */
export const lineItemsToInvoiceAddLinesParams = ({
	lineItems,
}: {
	lineItems: LineItem[];
}): Stripe.InvoiceAddLinesParams.Line[] => {
	return lineItems.map((lineItem) => toStripeAddLineParams({ lineItem }));
};
