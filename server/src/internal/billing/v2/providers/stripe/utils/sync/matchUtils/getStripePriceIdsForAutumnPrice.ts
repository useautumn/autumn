import { getAllPriceStripeIds, type Price } from "@autumn/shared";

export const getStripePriceIdsForAutumnPrice = ({
	price,
}: {
	price: Price;
}): string[] => {
	return getAllPriceStripeIds({ config: price.config });
};
