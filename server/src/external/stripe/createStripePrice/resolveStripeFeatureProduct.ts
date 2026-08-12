import {
	type EntitlementWithFeature,
	type FullProduct,
	type Price,
	priceToEnt,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

const metadataForFeature = ({
	ctx,
	featureId,
	internalFeatureId,
	managed,
}: {
	ctx: AutumnContext;
	featureId: string;
	internalFeatureId: string;
	managed: boolean;
}) => ({
	autumn_feature_id: featureId,
	autumn_internal_feature_id: internalFeatureId,
	autumn_managed_feature_product: managed ? "true" : "false",
	autumn_environment: ctx.env,
});

const retrieveProduct = async ({
	stripeCli,
	stripeProductId,
}: {
	stripeCli: Stripe;
	stripeProductId: string;
}) => {
	try {
		const product = await stripeCli.products.retrieve(stripeProductId);
		return "deleted" in product ? null : product;
	} catch {
		return null;
	}
};

export const resolveStripeFeatureProduct = async ({
	ctx,
	stripeCli,
	price,
	product,
	entitlements,
	currentStripeProduct,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	price: Price;
	product: FullProduct;
	entitlements: EntitlementWithFeature[];
	currentStripeProduct: Stripe.Product | null;
}) => {
	const entitlement = priceToEnt({
		price,
		entitlements,
		errorOnNotFound: true,
	});
	const feature = entitlement.feature;
	const config = price.config as UsagePriceConfig;
	let stripeProduct = currentStripeProduct;
	if (!stripeProduct) {
		const siblingPrices = await PriceService.listByInternalFeatureId({
			db: ctx.db,
			orgId: ctx.org.id,
			internalFeatureId: config.internal_feature_id,
		});

		for (const siblingPrice of siblingPrices) {
			const stripeProductId = (siblingPrice.config as UsagePriceConfig)
				.stripe_product_id;
			if (!stripeProductId) continue;
			stripeProduct = await retrieveProduct({ stripeCli, stripeProductId });
			if (stripeProduct) break;
		}
	}

	if (!stripeProduct) {
		stripeProduct = await stripeCli.products.create(
			{
				name: feature.name,
				metadata: metadataForFeature({
					ctx,
					featureId: feature.id,
					internalFeatureId: config.internal_feature_id,
					managed: true,
				}),
			},
			{
				idempotencyKey: `autumn:feature-product:${ctx.org.id}:${ctx.env}:${config.internal_feature_id}`,
			},
		);
	} else {
		const legacyNames = [
			`${product.name} - ${feature.name}`,
			`${product.name} - ${config.billing_units} ${feature.name}`,
		];
		const isAutumnProduct =
			stripeProduct.metadata.autumn_managed_feature_product === "true" ||
			legacyNames.includes(stripeProduct.name);
		stripeProduct = await stripeCli.products.update(stripeProduct.id, {
			active: true,
			...(isAutumnProduct ? { name: feature.name } : {}),
			metadata: metadataForFeature({
				ctx,
				featureId: feature.id,
				internalFeatureId: config.internal_feature_id,
				managed: isAutumnProduct,
			}),
		});
	}

	if (config.stripe_product_id !== stripeProduct.id) {
		config.stripe_product_id = stripeProduct.id;
		await PriceService.update({
			db: ctx.db,
			id: price.id,
			update: { config },
		});
	}

	return stripeProduct;
};
