import type { Feature, Price, UsagePriceConfig } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { updateFeatureStripeProductIdIfUnset } from "@server/internal/features/repos/updateFeatureStripeProductIdIfUnset.js";
import type Stripe from "stripe";
import { buildStripeFeatureProductIdempotencyKey } from "../../prices/utils/buildIdempotencyKey.js";
import { retrieveLiveStripeProduct } from "./retrieveLiveStripeProduct.js";

export const resolveStripeProductForFeaturePrice = async ({
	db,
	stripeCli,
	feature,
	price,
}: {
	db: DrizzleCli;
	stripeCli: Stripe;
	feature: Feature;
	price: Price;
}): Promise<string> => {
	const config = price.config as UsagePriceConfig;

	const priceProduct = await retrieveLiveStripeProduct({
		stripeCli,
		productId: config.stripe_product_id,
	});
	if (priceProduct) return priceProduct.id;

	const featureProduct = await retrieveLiveStripeProduct({
		stripeCli,
		productId: feature.stripe_product_id,
	});
	if (featureProduct) {
		config.stripe_product_id = featureProduct.id;
		return featureProduct.id;
	}

	const created = await stripeCli.products.create(
		{
			name: feature.name,
			metadata: { autumn_feature_internal_id: feature.internal_id },
		},
		{
			idempotencyKey: buildStripeFeatureProductIdempotencyKey({
				featureInternalId: feature.internal_id,
			}),
		},
	);

	await updateFeatureStripeProductIdIfUnset({
		db,
		featureInternalId: feature.internal_id,
		newId: created.id,
		previousId: feature.stripe_product_id,
	});

	config.stripe_product_id = created.id;
	return created.id;
};
