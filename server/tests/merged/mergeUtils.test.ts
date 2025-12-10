import { cusProductToPrices, type FullCusProduct } from "@autumn/shared";
import { isFixedPrice } from "@server/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice";

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
	return prices.find((p) => isFixedPrice({ price: p }));
};
