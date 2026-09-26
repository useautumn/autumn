import {
	type Feature,
	type FullCusProduct,
	findFeatureById,
	getAllPriceStripeIds,
} from "@autumn/shared";
import type {
	AutumnStripePrice,
	AutumnStripePriceIndex,
} from "./types/autumnStripePriceIndex";

export const buildAutumnStripePriceIndex = ({
	customerProducts,
	features,
}: {
	customerProducts: FullCusProduct[];
	features: Feature[];
}): AutumnStripePriceIndex => {
	const priceIndex: AutumnStripePriceIndex = {
		byAutumnPriceId: new Map(),
		byStripePriceId: new Map(),
	};

	for (const customerProduct of customerProducts) {
		for (const { price } of customerProduct.customer_prices) {
			const featureId = price.config.feature_id ?? null;
			const feature = featureId
				? findFeatureById({ features, featureId })
				: undefined;
			const autumnStripePrice: AutumnStripePrice = {
				planId: customerProduct.product_id,
				featureId,
				displayName: feature?.name ?? customerProduct.product.name,
			};

			priceIndex.byAutumnPriceId.set(price.id, autumnStripePrice);
			for (const stripePriceId of getAllPriceStripeIds({
				config: price.config,
			})) {
				priceIndex.byStripePriceId.set(stripePriceId, autumnStripePrice);
			}
		}
	}

	return priceIndex;
};
