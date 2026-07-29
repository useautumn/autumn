import { expect, test } from "bun:test";
import {
	ApiVersion,
	FeatureType,
	UsagePriceConfigSchema,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { createProducts } from "@tests/utils/productUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initStripeResourcesForProducts } from "@/internal/billing/v2/providers/stripe/utils/common/initStripeResourcesForProducts.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "@/internal/products/ProductService.js";

const uniqueSuffix = () =>
	`${Date.now()}_${Math.random().toString(36).slice(2)}`;

const createMeteredFeature = async ({
	autumn,
	featureId,
}: {
	autumn: Pick<AutumnInt, "post">;
	featureId: string;
}) => {
	await autumn.post("/features.create", {
		feature_id: featureId,
		name: featureId,
		type: FeatureType.Metered,
		consumable: true,
	});
};

const createProductWithoutStripeResources = async ({
	ctx,
	product,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	product: ReturnType<typeof products.pro>;
}) => {
	const autumn = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey,
	});

	await createProducts({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		autumn,
		products: [product],
		createInStripe: false,
	});
};

const createUsageProductWithoutStripeResources = async ({
	autumn,
	ctx,
	featureId,
	productId,
}: {
	autumn: Pick<AutumnInt, "post">;
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	featureId: string;
	productId: string;
}) => {
	await createMeteredFeature({
		autumn,
		featureId,
	});

	const product = products.pro({
		id: productId,
		items: [
			items.consumable({
				featureId,
				includedUsage: 0,
				price: 0.05,
				billingUnits: 1000,
			}),
		],
	});

	await createProductWithoutStripeResources({ ctx, product });
};

const setFeatureStripeMeter = async ({
	ctx,
	featureId,
	stripeMeter,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	featureId: string;
	stripeMeter: { id: string; event_name: string };
}) => {
	const feature = await FeatureService.get({
		db: ctx.db,
		id: featureId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	await FeatureService.update({
		db: ctx.db,
		internalId: feature.internal_id,
		updates: {
			stripe_meter: stripeMeter,
		},
	});
};

const initializeResourcesAndGetUsageConfig = async ({
	ctx,
	productId,
	featureId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	productId: string;
	featureId: string;
}) => {
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		idOrInternalId: productId,
	});

	await initStripeResourcesForProducts({
		ctx,
		products: [fullProduct],
	});

	const updatedProduct = await ProductService.getFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		idOrInternalId: productId,
	});
	const usagePrice = updatedProduct.prices.find(
		(price) => price.config.feature_id === featureId,
	);

	expect(usagePrice).toBeDefined();
	if (!usagePrice) {
		throw new Error(`Expected usage price for feature ${featureId}`);
	}

	const config = UsagePriceConfigSchema.parse(usagePrice.config);
	expect(config.stripe_price_id).toBeString();
	expect(config.stripe_product_id).toBeString();
	if (!config.stripe_price_id || !config.stripe_product_id) {
		throw new Error("Expected initialized Stripe price and product IDs");
	}

	return config;
};

test.concurrent(`${chalk.yellowBright("stripe resources: usage price uses feature-level stripe meter")}`, async () => {
	const suffix = uniqueSuffix();
	const featureId = `feature_meter_${suffix}`;
	const productId = `feature_meter_product_${suffix}`;

	const { autumnV2_2, ctx } = await initScenario({
		setup: [],
		actions: [],
	});

	await createUsageProductWithoutStripeResources({
		autumn: autumnV2_2,
		ctx,
		featureId,
		productId,
	});

	const stripeMeter = await ctx.stripeCli.billing.meters.create({
		display_name: `Feature meter ${suffix}`,
		event_name: `feature_meter_event_${suffix}`,
		default_aggregation: { formula: "sum" },
	});

	await setFeatureStripeMeter({
		ctx,
		featureId,
		stripeMeter: {
			id: stripeMeter.id,
			event_name: stripeMeter.event_name,
		},
	});

	const config = await initializeResourcesAndGetUsageConfig({
		ctx,
		productId,
		featureId,
	});

	expect(config.stripe_meter_id).toBe(stripeMeter.id);
	expect(config.stripe_event_name).toBe(stripeMeter.event_name);

	if (!config.stripe_price_id || !config.stripe_product_id) {
		throw new Error("Expected initialized Stripe price and product IDs");
	}

	const stripePrice = await ctx.stripeCli.prices.retrieve(config.stripe_price_id);
	expect(stripePrice.product).toBe(config.stripe_product_id);
	expect(stripePrice.recurring?.usage_type).toBe("metered");
	expect(stripePrice.recurring?.meter).toBe(stripeMeter.id);
});

test.concurrent(`${chalk.yellowBright("stripe resources: missing feature-level stripe meter falls back to a new meter")}`, async () => {
	const suffix = uniqueSuffix();
	const featureId = `feature_meter_missing_${suffix}`;
	const productId = `feature_meter_missing_product_${suffix}`;
	const missingStripeMeter = {
		id: `mtr_missing_${suffix}`,
		event_name: `feature_meter_missing_event_${suffix}`,
	};

	const { autumnV2_2, ctx } = await initScenario({
		setup: [],
		actions: [],
	});

	await createUsageProductWithoutStripeResources({
		autumn: autumnV2_2,
		ctx,
		featureId,
		productId,
	});

	await setFeatureStripeMeter({
		ctx,
		featureId,
		stripeMeter: missingStripeMeter,
	});

	const config = await initializeResourcesAndGetUsageConfig({
		ctx,
		productId,
		featureId,
	});

	expect(config.stripe_meter_id).toBeString();
	expect(config.stripe_event_name).toBeString();
	expect(config.stripe_meter_id).not.toBe(missingStripeMeter.id);
	expect(config.stripe_event_name).not.toBe(missingStripeMeter.event_name);

	if (!config.stripe_meter_id || !config.stripe_price_id) {
		throw new Error("Expected fallback Stripe meter and price IDs");
	}

	const fallbackMeter = await ctx.stripeCli.billing.meters.retrieve(
		config.stripe_meter_id,
	);
	expect(fallbackMeter.id).toBe(config.stripe_meter_id);

	const stripePrice = await ctx.stripeCli.prices.retrieve(config.stripe_price_id);
	expect(stripePrice.recurring?.usage_type).toBe("metered");
	expect(stripePrice.recurring?.meter).toBe(config.stripe_meter_id);
});
