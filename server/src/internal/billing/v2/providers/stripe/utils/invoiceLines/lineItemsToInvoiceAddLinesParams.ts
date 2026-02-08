import { atmnToStripeAmount, type LineItem, msToSeconds } from "@autumn/shared";
import type Stripe from "stripe";

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
	const { effectivePeriod } = context;

	return {
		description,
		amount: atmnToStripeAmount({ amount: finalAmount }),
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
