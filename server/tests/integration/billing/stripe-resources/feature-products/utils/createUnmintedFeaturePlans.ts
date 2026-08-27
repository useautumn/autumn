import type { UsagePriceConfig } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { ProductService } from "@/internal/products/ProductService.js";

export const uniqueSuffix = () =>
	`${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const usagePriceForFeature = async ({
	ctx,
	productId,
	featureId = TestFeature.Messages,
}: {
	ctx: AutumnContext;
	productId: string;
	featureId?: string;
}) => {
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		idOrInternalId: productId,
	});
	const price = fullProduct.prices.find(
		(candidate) =>
			(candidate.config as UsagePriceConfig).feature_id === featureId,
	);
	if (!price) {
		throw new Error(`Expected usage price for ${featureId} on ${productId}`);
	}
	return { fullProduct, price, config: price.config as UsagePriceConfig };
};

export const getFeatureRow = async ({
	ctx,
	featureId = TestFeature.Messages,
}: {
	ctx: AutumnContext;
	featureId?: string;
}) => {
	const feature = await FeatureService.get({
		db: ctx.db,
		id: featureId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	if (!feature) {
		throw new Error(`Expected feature ${featureId}`);
	}
	return feature;
};

export const wipePriceStripeIds = async ({
	ctx,
	priceId,
	config,
}: {
	ctx: AutumnContext;
	priceId: string;
	config: UsagePriceConfig;
}) => {
	const next = { ...config };
	next.stripe_price_id = undefined;
	next.stripe_product_id = undefined;
	next.stripe_meter_id = undefined;
	next.stripe_prepaid_price_v2_id = undefined;
	next.stripe_empty_price_id = undefined;
	next.stripe_placeholder_price_id = undefined;
	await PriceService.update({
		db: ctx.db,
		id: priceId,
		update: { config: next },
	});
};
