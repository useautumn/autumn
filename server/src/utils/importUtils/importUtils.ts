import Stripe from "stripe";
import { subItemToFixedPrice } from "@/internal/products/prices/priceUtils/constructPriceUtils.js";
import { isFixedPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { FullProduct } from "@autumn/shared";

// Scenario 1: Replace base price with new base price
export const replaceBasePrice = async ({
	subItems,
	autumnProduct,
	basePrice,
}: {
	subItems: Stripe.SubscriptionItem[];
	autumnProduct: FullProduct;
	basePrice?: number;
}) => {
	let prices = autumnProduct.prices.filter((p) => !isFixedPrice({ price: p }));

	// Get first sub item
	const subItem = subItems[0];
	const customPrice = subItemToFixedPrice({
		subItem,
		product: autumnProduct,
		basePrice,
	});

	return [customPrice, ...prices];
};
