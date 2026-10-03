import type { Feature, Price, UsagePriceConfig } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { updateFeatureStripeProductIdIfUnset } from "@server/internal/features/repos/updateFeatureStripeProductIdIfUnset.js";
import { PriceService } from "@server/internal/products/prices/PriceService.js";
import type Stripe from "stripe";
import { buildStripeFeatureProductIdempotencyKey } from "../../prices/utils/buildIdempotencyKey.js";
import { retrieveLiveStripeProduct } from "./retrieveLiveStripeProduct.js";

/** The Stripe Product the price's plan already bills this feature under, e.g. a
 * custom Enterprise price inherits "Enterprise - Emails". Same entity scope only;
 * same interval first, then newest. */
const retrievePlanFeatureStripeProduct = async ({
	db,
	stripeCli,
	feature,
	entityFeatureId,
	price,
}: {
	db: DrizzleCli;
	stripeCli: Stripe;
	feature: Feature;
	entityFeatureId: string | null;
	price: Price;
}): Promise<Stripe.Product | null> => {
	if (!price.internal_product_id) return null;

	const config = price.config as UsagePriceConfig;
	const catalogPrices = await PriceService.listCatalogForFeature({
		db,
		internalProductId: price.internal_product_id,
		internalFeatureId: feature.internal_id,
		entityFeatureId,
	});

	const sameIntervalFirst = catalogPrices
		.filter((catalogPrice) => catalogPrice.id !== price.id)
		.sort((a, b) => {
			const aMatches =
				(a.config as UsagePriceConfig).interval === config.interval;
			const bMatches =
				(b.config as UsagePriceConfig).interval === config.interval;
			return Number(bMatches) - Number(aMatches);
		});

	const checkedProductIds = new Set<string>();
	for (const catalogPrice of sameIntervalFirst) {
		const productId = (catalogPrice.config as UsagePriceConfig)
			.stripe_product_id;
		if (!productId || checkedProductIds.has(productId)) continue;
		checkedProductIds.add(productId);

		const product = await retrieveLiveStripeProduct({ stripeCli, productId });
		if (product) return product;
	}

	return null;
};

export const resolveStripeProductForFeaturePrice = async ({
	db,
	stripeCli,
	feature,
	entityFeatureId = null,
	price,
}: {
	db: DrizzleCli;
	stripeCli: Stripe;
	feature: Feature;
	/** Entity scope of the price's entitlement; only same-scope plan prices are inherited. */
	entityFeatureId?: string | null;
	price: Price;
}): Promise<string> => {
	const config = price.config as UsagePriceConfig;

	const priceProduct = await retrieveLiveStripeProduct({
		stripeCli,
		productId: config.stripe_product_id,
	});
	if (priceProduct) return priceProduct.id;

	const planProduct = await retrievePlanFeatureStripeProduct({
		db,
		stripeCli,
		feature,
		entityFeatureId,
		price,
	});
	if (planProduct) {
		config.stripe_product_id = planProduct.id;
		return planProduct.id;
	}

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

	// Stripe replays this idempotency key for 24h, so `created` can be a stale
	// body describing a product that has since been archived.
	const liveProduct =
		(await retrieveLiveStripeProduct({ stripeCli, productId: created.id })) ??
		created;

	await updateFeatureStripeProductIdIfUnset({
		db,
		featureInternalId: feature.internal_id,
		newId: liveProduct.id,
		previousId: feature.stripe_product_id,
	});

	config.stripe_product_id = liveProduct.id;
	return liveProduct.id;
};
