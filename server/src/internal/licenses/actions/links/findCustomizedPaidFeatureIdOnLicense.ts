import {
	type FullProduct,
	findPriceByFeatureId,
	isUsagePrice,
	pricesAreSame,
} from "@autumn/shared";

/** Feature id of a usage price on the overlay that is not an unchanged stock usage price. */
export const findCustomizedPaidFeatureIdOnLicense = ({
	stockProduct,
	effectiveProduct,
}: {
	stockProduct: FullProduct;
	effectiveProduct: FullProduct;
}): string | undefined => {
	for (const price of effectiveProduct.prices) {
		if (!isUsagePrice({ price })) continue;
		const featureId = price.config.feature_id;
		if (typeof featureId !== "string") continue;

		const stockPrice = findPriceByFeatureId({
			prices: stockProduct.prices,
			featureId,
		});
		if (!stockPrice || !pricesAreSame(price, stockPrice)) return featureId;
	}
	return undefined;
};
