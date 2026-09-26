import {
	type CatalogUpdateMappingsParams,
	ErrCode,
	type Feature,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { buildProductMappingContext } from "../catalogMappingUtils.js";
import { createMappingStripeProduct } from "./createMappingStripeProduct.js";
import {
	normalizeStripeProductId,
	type PriceTargets,
	setPriceTarget,
} from "./updateMappingUtils.js";

const findMappedFeature = ({
	features,
	featureId,
}: {
	features: Feature[];
	featureId: string;
}) => {
	const feature = features.find((candidate) => candidate.id === featureId);
	if (feature) return feature;

	throw new RecaseError({
		message: `Feature ${featureId} not found`,
		code: ErrCode.FeatureNotFound,
		statusCode: 404,
	});
};

/** Prices already on another product were chosen on purpose, so only the old default's move. */
const targetFeaturePricesOnPreviousDefault = ({
	ctx,
	products,
	feature,
	previousStripeProductId,
	stripeProductId,
	priceTargets,
}: {
	ctx: AutumnContext;
	products: FullProduct[];
	feature: Feature;
	previousStripeProductId: string | null;
	stripeProductId: string | null;
	priceTargets: PriceTargets;
}) => {
	for (const product of products) {
		const context = buildProductMappingContext({
			product,
			features: ctx.features,
			currency: ctx.org.default_currency || "usd",
		});

		for (const entry of context.itemPrices) {
			if (entry.item.feature_id !== feature.id) continue;
			const currentStripeProductId =
				entry.price.config.stripe_product_id ?? null;
			if (currentStripeProductId !== previousStripeProductId) continue;

			setPriceTarget({
				targets: priceTargets,
				price: entry.price,
				product,
				priceId: entry.price.id,
				stripeProductId,
				source: "item",
				matchExistingStripePrice: true,
			});
		}
	}
};

export const applyFeatureMappings = async ({
	ctx,
	params,
	products,
	priceTargets,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateMappingsParams;
	products: FullProduct[];
	priceTargets: PriceTargets;
}) => {
	for (const mapping of params.feature_mappings) {
		const feature = findMappedFeature({
			features: ctx.features,
			featureId: mapping.feature_id,
		});
		const previousStripeProductId = feature.stripe_product_id ?? null;
		const stripeProductId = mapping.create_stripe_product
			? await createMappingStripeProduct({ ctx, name: feature.name })
			: normalizeStripeProductId(mapping.stripe_product_id);
		if (previousStripeProductId === stripeProductId) continue;

		await FeatureService.update({
			db: ctx.db,
			internalId: feature.internal_id,
			updates: { stripe_product_id: stripeProductId },
		});

		targetFeaturePricesOnPreviousDefault({
			ctx,
			products,
			feature,
			previousStripeProductId,
			stripeProductId,
			priceTargets,
		});
	}
};
