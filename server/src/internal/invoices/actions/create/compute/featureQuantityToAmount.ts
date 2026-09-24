import { type Price, priceToLineAmount } from "@autumn/shared";

/**
 * Prices billable feature units with the price's tiers and billing units.
 * No allowance is subtracted: the caller already excluded included usage.
 */
export const featureQuantityToAmount = ({
	price,
	quantity,
	currency,
}: {
	price: Price;
	quantity: number;
	currency: string;
}): number => {
	if (quantity <= 0) return 0;
	return priceToLineAmount({ price, overage: quantity, currency });
};
