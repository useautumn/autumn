import { test } from "bun:test";
import { ProductItemFeatureType } from "@autumn/shared";
import { BillingMethod } from "@autumn/shared/api/products/components/billingMethod.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	createCatalogMappingProducts,
	expectDependentStripeFieldsCleared,
	expectPriceStripeProduct,
	expectUsageStripePriceResources,
	findItemPriceByFilter,
} from "./utils/catalogMappingTestUtils.js";

const tieredConsumableMessagesItem = ({
	includedUsage = 100,
	billingUnits = 1,
}: {
	includedUsage?: number;
	billingUnits?: number;
} = {}) => ({
	...items.tieredConsumableMessages({
		includedUsage,
		billingUnits,
		tiers: [
			{ to: 500, amount: 0.1 },
			{ to: "inf", amount: 0.05 },
		],
	}),
	feature_type: ProductItemFeatureType.SingleUse,
});

const tieredPrepaidMessagesItem = () => ({
	...items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		tiers: [
			{ to: 500, amount: 10 },
			{ to: "inf", amount: 5 },
		],
	}),
	feature_type: ProductItemFeatureType.SingleUse,
});

const usageMessagesFilter = {
	feature_id: TestFeature.Messages,
	billing_method: BillingMethod.UsageBased,
} as const;

const prepaidMessagesFilter = {
	feature_id: TestFeature.Messages,
	billing_method: BillingMethod.Prepaid,
} as const;

const createMeteredStripePrice = async ({
	ctx,
	stripeProductId,
	tiers,
	tiersMode = "graduated",
	suffix,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	stripeProductId: string;
	tiers: Array<{
		up_to: number | "inf";
		unit_amount?: number;
		unit_amount_decimal?: string;
		flat_amount?: number;
	}>;
	tiersMode?: "graduated" | "volume";
	suffix: string;
}) => {
	const meter = await ctx.stripeCli.billing.meters.create({
		display_name: `Catalog mapping ${suffix}`,
		event_name: `catalog_mapping_${suffix}_${Date.now()}`,
		default_aggregation: { formula: "sum" },
	});
	const price = await ctx.stripeCli.prices.create({
		product: stripeProductId,
		currency: "usd",
		recurring: {
			interval: "month",
			usage_type: "metered",
			meter: meter.id,
		},
		billing_scheme: "tiered",
		tiers_mode: tiersMode,
		tiers,
	});

	return { meter, price };
};

const updateUsageMapping = async ({
	autumn,
	planId,
	stripeProductId,
	filter = usageMessagesFilter,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_2"];
	planId: string;
	stripeProductId: string;
	filter?: typeof usageMessagesFilter | typeof prepaidMessagesFilter;
}) =>
	autumn.post("/catalog.update_mappings", {
		processor_type: "stripe",
		plan_mappings: [
			{
				plan_id: planId,
				stripe_product_id: null,
				scope: "none",
				item_mappings: [
					{
						filter,
						stripe_product_id: stripeProductId,
					},
				],
			},
		],
	});

const getMappedPrice = async ({
	ctx,
	planId,
	filter = usageMessagesFilter,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	planId: string;
	filter?: typeof usageMessagesFilter | typeof prepaidMessagesFilter;
}) => {
	const updated = await ProductService.getFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		idOrInternalId: planId,
	});
	return findItemPriceByFilter({ ctx, product: updated, filter });
};

test.concurrent(
	`${chalk.yellowBright("catalog mappings: item mapping reuses matching graduated consumable Stripe price")}`,
	async () => {
		const planId = "catalog_mappings_usage_reuse_stripe_price";
		const product = products.pro({
			id: planId,
			items: [tieredConsumableMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});

		const stripeProduct = await ctx.stripeCli.products.create({
			name: `Catalog mapping usage reuse ${planId}`,
		});
		const { meter, price: matchingStripePrice } =
			await createMeteredStripePrice({
				ctx,
				stripeProductId: stripeProduct.id,
				suffix: planId,
				tiers: [
					{ up_to: 100, unit_amount: 0 },
					{ up_to: 600, unit_amount: 10 },
					{ up_to: "inf", unit_amount: 5 },
				],
			});

		await updateUsageMapping({
			autumn: autumnV2_2,
			planId,
			stripeProductId: stripeProduct.id,
		});

		expectUsageStripePriceResources({
			price: await getMappedPrice({ ctx, planId }),
			stripeProductId: stripeProduct.id,
			stripePriceId: matchingStripePrice.id,
			stripeMeterId: meter.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: item mapping reuses matching per-unit consumable Stripe price")}`,
	async () => {
		const planId = "catalog_mappings_usage_per_unit_reuse";
		const product = products.pro({
			id: planId,
			items: [
				{
					...items.tieredConsumableMessages({
						includedUsage: 0,
						billingUnits: 100,
						tiers: [{ to: "inf", amount: 10 }],
					}),
					feature_type: ProductItemFeatureType.SingleUse,
				},
			],
		});

		const { autumnV2_2, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});

		const stripeProduct = await ctx.stripeCli.products.create({
			name: `Catalog mapping usage per unit ${planId}`,
		});
		const meter = await ctx.stripeCli.billing.meters.create({
			display_name: `Catalog mapping ${planId}`,
			event_name: `catalog_mapping_${planId}_${Date.now()}`,
			default_aggregation: { formula: "sum" },
		});
		const matchingStripePrice = await ctx.stripeCli.prices.create({
			product: stripeProduct.id,
			currency: "usd",
			unit_amount: 10,
			recurring: {
				interval: "month",
				usage_type: "metered",
				meter: meter.id,
			},
		});

		await updateUsageMapping({
			autumn: autumnV2_2,
			planId,
			stripeProductId: stripeProduct.id,
		});

		expectUsageStripePriceResources({
			price: await getMappedPrice({ ctx, planId }),
			stripeProductId: stripeProduct.id,
			stripePriceId: matchingStripePrice.id,
			stripeMeterId: meter.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: item mapping clears usage fields when graduated tiers do not match")}`,
	async () => {
		const planId = "catalog_mappings_usage_mismatch_stripe_price";
		const product = products.pro({
			id: planId,
			items: [tieredConsumableMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});

		const stripeProduct = await ctx.stripeCli.products.create({
			name: `Catalog mapping usage mismatch ${planId}`,
		});
		await createMeteredStripePrice({
			ctx,
			stripeProductId: stripeProduct.id,
			suffix: planId,
			tiers: [
				{ up_to: 100, unit_amount: 0 },
				{ up_to: 600, unit_amount: 11 },
				{ up_to: "inf", unit_amount: 5 },
			],
		});

		await updateUsageMapping({
			autumn: autumnV2_2,
			planId,
			stripeProductId: stripeProduct.id,
		});

		const usagePrice = await getMappedPrice({ ctx, planId });
		expectPriceStripeProduct({
			price: usagePrice,
			stripeProductId: stripeProduct.id,
		});
		expectDependentStripeFieldsCleared({ price: usagePrice });
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: item mapping ignores graduated Stripe prices with flat amounts")}`,
	async () => {
		const planId = "catalog_mappings_usage_flat_amount_ignored";
		const product = products.pro({
			id: planId,
			items: [tieredConsumableMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});

		const stripeProduct = await ctx.stripeCli.products.create({
			name: `Catalog mapping usage flat ${planId}`,
		});
		await createMeteredStripePrice({
			ctx,
			stripeProductId: stripeProduct.id,
			suffix: planId,
			tiers: [
				{ up_to: 100, unit_amount: 0 },
				{ up_to: 600, unit_amount: 10, flat_amount: 1 },
				{ up_to: "inf", unit_amount: 5 },
			],
		});

		await updateUsageMapping({
			autumn: autumnV2_2,
			planId,
			stripeProductId: stripeProduct.id,
		});

		const usagePrice = await getMappedPrice({ ctx, planId });
		expectPriceStripeProduct({
			price: usagePrice,
			stripeProductId: stripeProduct.id,
		});
		expectDependentStripeFieldsCleared({ price: usagePrice });
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: item mapping ignores volume Stripe tier prices")}`,
	async () => {
		const planId = "catalog_mappings_usage_volume_ignored";
		const product = products.pro({
			id: planId,
			items: [tieredConsumableMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});

		const stripeProduct = await ctx.stripeCli.products.create({
			name: `Catalog mapping usage volume ${planId}`,
		});
		await createMeteredStripePrice({
			ctx,
			stripeProductId: stripeProduct.id,
			suffix: planId,
			tiersMode: "volume",
			tiers: [
				{ up_to: 100, unit_amount: 0 },
				{ up_to: 600, unit_amount: 10 },
				{ up_to: "inf", unit_amount: 5 },
			],
		});

		await updateUsageMapping({
			autumn: autumnV2_2,
			planId,
			stripeProductId: stripeProduct.id,
		});

		const usagePrice = await getMappedPrice({ ctx, planId });
		expectPriceStripeProduct({
			price: usagePrice,
			stripeProductId: stripeProduct.id,
		});
		expectDependentStripeFieldsCleared({ price: usagePrice });
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: item mapping does not reuse Stripe prices for prepaid tiers")}`,
	async () => {
		const planId = "catalog_mappings_prepaid_tiers_no_reuse";
		const product = products.pro({
			id: planId,
			items: [tieredPrepaidMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});

		const stripeProduct = await ctx.stripeCli.products.create({
			name: `Catalog mapping prepaid no reuse ${planId}`,
		});
		await createMeteredStripePrice({
			ctx,
			stripeProductId: stripeProduct.id,
			suffix: planId,
			tiers: [
				{ up_to: 500, unit_amount: 10 },
				{ up_to: "inf", unit_amount: 5 },
			],
		});

		await updateUsageMapping({
			autumn: autumnV2_2,
			planId,
			stripeProductId: stripeProduct.id,
			filter: prepaidMessagesFilter,
		});

		const prepaidPrice = await getMappedPrice({
			ctx,
			planId,
			filter: prepaidMessagesFilter,
		});
		expectPriceStripeProduct({
			price: prepaidPrice,
			stripeProductId: stripeProduct.id,
		});
		expectDependentStripeFieldsCleared({ price: prepaidPrice });
	},
);
