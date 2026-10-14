import { type Price, priceToLineAmount } from "@autumn/shared";

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
