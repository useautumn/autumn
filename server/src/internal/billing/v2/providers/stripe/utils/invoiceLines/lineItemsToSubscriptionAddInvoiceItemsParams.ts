import { atmnToStripeAmount, type LineItem, msToSeconds } from "@autumn/shared";
import type Stripe from "stripe";
import { lineItemToStripeProductId } from "./lineItemToStripeProductId";

const toStripeSubscriptionAddInvoiceItem = ({
	lineItem,
}: {
	lineItem: LineItem;
}): Stripe.SubscriptionUpdateParams.AddInvoiceItem | undefined => {
	const { amountAfterDiscounts, context } = lineItem;
	const stripeProductId = lineItemToStripeProductId({ lineItem });

	if (!stripeProductId) {
		return undefined;
	}

	return {
		quantity: 1,
		price_data: {
			currency: context.currency,
			product: stripeProductId,
			unit_amount: atmnToStripeAmount({ amount: amountAfterDiscounts }),
		},
		period: context.effectivePeriod
			? {
					start: {
						type: "timestamp",
						timestamp: msToSeconds(context.effectivePeriod.start),
					},
					end: {
						type: "timestamp",
						timestamp: msToSeconds(context.effectivePeriod.end),
					},
				}
			: undefined,
	};
};

export const lineItemsToSubscriptionAddInvoiceItemsParams = ({
	lineItems,
}: {
	lineItems: LineItem[];
}): Stripe.SubscriptionUpdateParams.AddInvoiceItem[] => {
	return lineItems
		.map((lineItem) =>
			toStripeSubscriptionAddInvoiceItem({
				lineItem,
			}),
		)
		.filter(
			(
				invoiceItem,
			): invoiceItem is Stripe.SubscriptionUpdateParams.AddInvoiceItem =>
				invoiceItem !== undefined,
		);
};
