import { atmnToStripeAmount, type LineItem, msToSeconds } from "@autumn/shared";
import type Stripe from "stripe";
import { lineItemToMetadata } from "./lineItemToMetadata";
import { lineItemToStripeProductId } from "./lineItemToStripeProductId";

const toStripeAddLineParams = ({
	lineItem,
}: {
	lineItem: LineItem;
}): Stripe.InvoiceAddLinesParams.Line => {
	const { amount, amountAfterDiscounts, description, context } = lineItem;
	const { effectivePeriod, currency, discountable } = context;

	const lineAmount = discountable ? amount : amountAfterDiscounts;
	const isNegative = lineAmount < 0;
	const stripeProductId = lineItemToStripeProductId({ lineItem });

	const shouldUsePriceData = !isNegative && stripeProductId;

	return {
		description,
		amount: shouldUsePriceData
			? undefined
			: atmnToStripeAmount({ amount: lineAmount, currency }),
		price_data: shouldUsePriceData
			? {
					unit_amount: atmnToStripeAmount({ amount: lineAmount, currency }),
					currency,
					product: stripeProductId,
				}
			: undefined,
		metadata: lineItemToMetadata({ lineItem }),
		discountable: discountable ?? false,
		period: effectivePeriod
			? {
					start: msToSeconds(effectivePeriod.start),
					end: msToSeconds(effectivePeriod.end),
				}
			: undefined,
	};
};

export const lineItemsToInvoiceAddLinesParams = ({
	lineItems,
}: {
	lineItems: LineItem[];
}): Stripe.InvoiceAddLinesParams.Line[] => {
	return lineItems.map((lineItem) => toStripeAddLineParams({ lineItem }));
};
