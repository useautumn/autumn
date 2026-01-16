import {
	cusProductToPrices,
	type FullCusProduct,
	isFixedPrice,
} from "@autumn/shared";

export const cusProductToSubIds = ({
	cusProducts,
}: {
	cusProducts: FullCusProduct[];
}) => {
	return [...new Set(cusProducts.flatMap((cp) => cp.subscription_ids || []))];
};

export const cpToPrice = ({
	cp,
	type,
}: {
	cp: FullCusProduct;
	type: "base" | "arrear" | "cont" | "prepaid";
}) => {
	const prices = cusProductToPrices({ cusProduct: cp });
	return prices.find((p) => isFixedPrice(p));
};
