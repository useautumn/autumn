import { expect, test } from "bun:test";
import {
	ErrCode,
	FeatureType,
	type FullProduct,
	ProductItemFeatureType,
	UsagePriceConfigSchema,
} from "@autumn/shared";
import { BillingMethod } from "@autumn/shared/api/products/components/billingMethod.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import {
	createCatalogMappingProducts,
	expectDependentStripeFieldsCleared,
	expectPriceStripeProduct,
	findItemPriceByFilter,
} from "./utils/catalogMappingTestUtils.js";

type Scenario = Awaited<ReturnType<typeof initScenario>>;

const prepaidMessagesFilter = {
	feature_id: TestFeature.Messages,
	billing_method: BillingMethod.Prepaid,
} as const;

const getPlan = ({ ctx, planId }: { ctx: Scenario["ctx"]; planId: string }) =>
	ProductService.getFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		idOrInternalId: planId,
	});

const findFeaturePrice = ({
	product,
	featureId,
}: {
	product: FullProduct;
	featureId: string;
}) => product.prices.find((price) => price.config.feature_id === featureId);

const createPrepaidPlan = async ({
	scenario,
	planId,
}: {
	scenario: Scenario;
	planId: string;
}) => {
	await createCatalogMappingProducts({
		ctx: scenario.ctx,
		autumn: scenario.autumnV2_2,
		products: [
			products.pro({
				id: planId,
				items: [
					{
						...items.prepaidMessages({ billingUnits: 100, price: 10 }),
						feature_type: ProductItemFeatureType.SingleUse,
					},
				],
			}),
		],
	});
	const plan = await getPlan({ ctx: scenario.ctx, planId });
	return findItemPriceByFilter({
		ctx: scenario.ctx,
		product: plan,
		filter: prepaidMessagesFilter,
	})!;
};

const createLicensedStripePrice = async ({
	ctx,
	name,
}: {
	ctx: Scenario["ctx"];
	name: string;
}) => {
	const stripeProduct = await ctx.stripeCli.products.create({ name });
	const stripePrice = await ctx.stripeCli.prices.create({
		product: stripeProduct.id,
		currency: "usd",
		unit_amount: 1000,
		recurring: { interval: "month" },
	});
	return { stripeProduct, stripePrice };
};

test.concurrent(
	`${chalk.yellowBright("catalog mappings: feature default moves prices on the old default only")}`,
	async () => {
		const featureId = "catalog_mapping_feature_default";
		const planA = "catalog_mapping_feature_default_a";
		const planB = "catalog_mapping_feature_default_b";
		const scenario = await initScenario({ setup: [], actions: [] });
		const { ctx, autumnV2_2 } = scenario;

		await autumnV2_2.post("/features.create", {
			feature_id: featureId,
			name: featureId,
			type: FeatureType.Metered,
			consumable: true,
		});
		const usageItem = {
			...items.consumable({ featureId, price: 0.25 }),
			feature_type: ProductItemFeatureType.SingleUse,
		};
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [
				products.pro({ id: planA, items: [usageItem] }),
				products.pro({ id: planB, items: [usageItem] }),
			],
		});

		const firstDefault = await ctx.stripeCli.products.create({
			name: `${featureId} first`,
		});
		await autumnV2_2.post("/catalog.update_mappings", {
			processor_type: "stripe",
			feature_mappings: [
				{ feature_id: featureId, stripe_product_id: firstDefault.id },
			],
		});

		// Plan B picks its own product, so a later default change must skip it.
		const planBPrice = findFeaturePrice({
			product: await getPlan({ ctx, planId: planB }),
			featureId,
		})!;
		await PriceService.update({
			db: ctx.db,
			id: planBPrice.id,
			update: {
				config: { ...planBPrice.config, stripe_product_id: "prod_custom_b" },
			},
		});

		const secondDefault = await ctx.stripeCli.products.create({
			name: `${featureId} second`,
		});
		await autumnV2_2.post("/catalog.update_mappings", {
			processor_type: "stripe",
			feature_mappings: [
				{ feature_id: featureId, stripe_product_id: secondDefault.id },
			],
		});

		const planAPrice = findFeaturePrice({
			product: await getPlan({ ctx, planId: planA }),
			featureId,
		});
		expectPriceStripeProduct({
			price: planAPrice,
			stripeProductId: secondDefault.id,
		});
		expectPriceStripeProduct({
			price: findFeaturePrice({
				product: await getPlan({ ctx, planId: planB }),
				featureId,
			}),
			stripeProductId: "prod_custom_b",
		});

		const storedFeature = await FeatureService.get({
			db: ctx.db,
			id: featureId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(storedFeature?.stripe_product_id).toBe(secondDefault.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: price mapping adopts a Stripe price into the prepaid slot")}`,
	async () => {
		const planId = "catalog_mapping_price_adopt";
		const scenario = await initScenario({ setup: [], actions: [] });
		const { ctx, autumnV2_2 } = scenario;
		const price = await createPrepaidPlan({ scenario, planId });
		const { stripeProduct, stripePrice } = await createLicensedStripePrice({
			ctx,
			name: planId,
		});

		await autumnV2_2.post("/catalog.update_mappings", {
			processor_type: "stripe",
			price_mappings: [
				{
					price_id: price.id,
					stripe_product_id: stripeProduct.id,
					stripe_price_id: stripePrice.id,
				},
			],
		});

		const mapped = findItemPriceByFilter({
			ctx,
			product: await getPlan({ ctx, planId }),
			filter: prepaidMessagesFilter,
		});
		const config = UsagePriceConfigSchema.parse(mapped!.config);
		expect(config.stripe_product_id).toBe(stripeProduct.id);
		expect(config.stripe_prepaid_price_v2_id).toBe(stripePrice.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: price mapping rejects a Stripe price from another product")}`,
	async () => {
		const planId = "catalog_mapping_price_wrong_product";
		const scenario = await initScenario({ setup: [], actions: [] });
		const { ctx, autumnV2_2 } = scenario;
		const price = await createPrepaidPlan({ scenario, planId });
		const { stripePrice } = await createLicensedStripePrice({
			ctx,
			name: `${planId} owner`,
		});
		const otherProduct = await ctx.stripeCli.products.create({
			name: `${planId} other`,
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.post("/catalog.update_mappings", {
					processor_type: "stripe",
					price_mappings: [
						{
							price_id: price.id,
							stripe_product_id: otherProduct.id,
							stripe_price_id: stripePrice.id,
						},
					],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: price mapping without a Stripe price clears it for re-creation")}`,
	async () => {
		const planId = "catalog_mapping_price_clear";
		const scenario = await initScenario({ setup: [], actions: [] });
		const { ctx, autumnV2_2 } = scenario;
		const price = await createPrepaidPlan({ scenario, planId });
		const { stripeProduct, stripePrice } = await createLicensedStripePrice({
			ctx,
			name: planId,
		});
		await autumnV2_2.post("/catalog.update_mappings", {
			processor_type: "stripe",
			price_mappings: [
				{
					price_id: price.id,
					stripe_product_id: stripeProduct.id,
					stripe_price_id: stripePrice.id,
				},
			],
		});

		await autumnV2_2.post("/catalog.update_mappings", {
			processor_type: "stripe",
			price_mappings: [
				{
					price_id: price.id,
					stripe_product_id: stripeProduct.id,
					stripe_price_id: null,
				},
			],
		});

		const cleared = findItemPriceByFilter({
			ctx,
			product: await getPlan({ ctx, planId }),
			filter: prepaidMessagesFilter,
		});
		expectPriceStripeProduct({
			price: cleared,
			stripeProductId: stripeProduct.id,
		});
		expectDependentStripeFieldsCleared({ price: cleared });
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: feature mapping can create a new default Stripe product")}`,
	async () => {
		const featureId = "catalog_mapping_feature_create";
		const planId = "catalog_mapping_feature_create_plan";
		const scenario = await initScenario({ setup: [], actions: [] });
		const { ctx, autumnV2_2 } = scenario;

		await autumnV2_2.post("/features.create", {
			feature_id: featureId,
			name: featureId,
			type: FeatureType.Metered,
			consumable: true,
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [
				products.pro({
					id: planId,
					items: [
						{
							...items.consumable({ featureId, price: 0.25 }),
							feature_type: ProductItemFeatureType.SingleUse,
						},
					],
				}),
			],
		});

		await autumnV2_2.post("/catalog.update_mappings", {
			processor_type: "stripe",
			feature_mappings: [
				{
					feature_id: featureId,
					stripe_product_id: null,
					create_stripe_product: true,
				},
			],
		});

		const storedFeature = await FeatureService.get({
			db: ctx.db,
			id: featureId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const createdId = storedFeature?.stripe_product_id;
		expect(createdId).toStartWith("prod_");
		const created = await ctx.stripeCli.products.retrieve(createdId!);
		expect(created.name).toBe(featureId);
		expectPriceStripeProduct({
			price: findFeaturePrice({
				product: await getPlan({ ctx, planId }),
				featureId,
			}),
			stripeProductId: createdId!,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: price mapping can create its own Stripe product")}`,
	async () => {
		const planId = "catalog_mapping_price_create";
		const scenario = await initScenario({ setup: [], actions: [] });
		const { ctx, autumnV2_2 } = scenario;
		const price = await createPrepaidPlan({ scenario, planId });

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.post("/catalog.update_mappings", {
					processor_type: "stripe",
					price_mappings: [
						{
							price_id: price.id,
							stripe_product_id: null,
							stripe_price_id: "price_unused",
							create_stripe_product: true,
						},
					],
				}),
		});

		await autumnV2_2.post("/catalog.update_mappings", {
			processor_type: "stripe",
			price_mappings: [
				{
					price_id: price.id,
					stripe_product_id: null,
					create_stripe_product: true,
				},
			],
		});

		const mapped = findItemPriceByFilter({
			ctx,
			product: await getPlan({ ctx, planId }),
			filter: prepaidMessagesFilter,
		});
		const createdId = UsagePriceConfigSchema.parse(
			mapped!.config,
		).stripe_product_id;
		expect(createdId).toStartWith("prod_");
		const created = await ctx.stripeCli.products.retrieve(createdId!);
		expect(created.name).toEndWith(" - Messages");
		expectDependentStripeFieldsCleared({ price: mapped });
	},
);
