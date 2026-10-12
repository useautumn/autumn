import { atmnToStripeAmount, type LineItem } from "@autumn/shared";
import { lineItemToStripeUnitPricing } from "./lineItemToStripeUnitPricing";

/** The quantity and price_data a positive line is billed with: quantity × rate when exact, else 1 × total. */
export const lineItemToStripePriceData = ({
	lineItem,
	lineAmount,
	stripeProductId,
}: {
	lineItem: LineItem;
	lineAmount: number;
	stripeProductId: string;
}) => {
	const { currency } = lineItem.context;
	const unitPricing = lineItemToStripeUnitPricing({ lineItem });

	if (!unitPricing) {
		return {
			// Only a line that may have been split is sent quantity 1, so a retry resets it.
			quantity: lineItem.unitPricing ? 1 : undefined,
			price_data: {
				unit_amount: atmnToStripeAmount({ amount: lineAmount, currency }),
				currency,
				product: stripeProductId,
			},
		};
	}

	return {
		quantity: unitPricing.quantity,
		price_data: {
			unit_amount_decimal: unitPricing.unitAmountDecimal,
			currency,
			product: stripeProductId,
		},
	};
};
