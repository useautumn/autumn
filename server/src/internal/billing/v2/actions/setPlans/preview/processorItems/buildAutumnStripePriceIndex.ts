import {
	cusProductToEnts,
	cusProductToPrices,
	type Feature,
	type FullCusProduct,
	findFeatureById,
	getAllPriceStripeIds,
	priceToEnt,
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
		const entitlements = cusProductToEnts({ cusProduct: customerProduct });
		for (const price of cusProductToPrices({ cusProduct: customerProduct })) {
			const featureId = price.config.feature_id ?? null;
			const feature = featureId
				? findFeatureById({ features, featureId })
				: undefined;
			const autumnStripePrice: AutumnStripePrice = {
				planId: customerProduct.product_id,
				planName: customerProduct.product.name,
				featureId,
				featureName: feature?.name ?? null,
				price,
				entitlement: priceToEnt({ price, entitlements }),
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
