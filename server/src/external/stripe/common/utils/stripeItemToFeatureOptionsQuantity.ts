import { type FullProduct, type Price, priceToEnt } from "@autumn/shared";
import { priceToAllowanceInPacks } from "@shared/utils/productUtils/priceUtils/convertPrice/priceToAllowanceInPacks";
import { Decimal } from "decimal.js";

export const stripeItemToFeatureOptionsQuantity = ({
	itemQuantity,
	price,
	product,
}: {
	itemQuantity: number;
	price: Price;
	product: FullProduct;
}) => {
	const entitlement = priceToEnt({
		price,
		entitlements: product.entitlements,
	});

	const allowanceInPacks = priceToAllowanceInPacks({
		price,
		entitlement,
	});

	return new Decimal(itemQuantity).sub(allowanceInPacks).toNumber();
};
