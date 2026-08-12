/** Red: paid feature prices create plan-specific Products. Green: all branches reuse one feature Product. */

import { expect, test } from "bun:test";
import {
	type CreateProductV2Params,
	FeatureUsageType,
	type FullProduct,
	isUsagePrice,
	ProductItemFeatureType,
	type UsagePriceConfig,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { initStripeResourcesForProducts } from "@/internal/billing/v2/providers/stripe/utils/common/initStripeResourcesForProducts.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { constructMeteredFeature } from "@/internal/features/utils/constructFeatureUtils.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { createProduct } from "@/internal/product/actions/createProduct.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import {
	constructArrearProratedItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";

const featureId = "ai_credits_shared_product";

const ensureFeature = async ({ id, name }: { id: string; name: string }) => {
	let feature = await FeatureService.get({
		db: ctx.db,
		id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	if (!feature) {
		await FeatureService.insert({
			db: ctx.db,
			logger: ctx.logger,
			data: constructMeteredFeature({
				featureId: id,
				name,
				orgId: ctx.org.id,
				env: ctx.env,
				usageType: FeatureUsageType.Single,
			}),
		});
		feature = await FeatureService.get({
			db: ctx.db,
			id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
	}
	ctx.features = await FeatureService.list({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	await clearOrgCache({ db: ctx.db, orgId: ctx.org.id, env: ctx.env });
	return feature;
};

const getProduct = async ({ productId }: { productId: string }) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

const getUsagePrice = ({ product }: { product: FullProduct }) => {
	const price = product.prices.find((price) => isUsagePrice({ price }));
	if (!price) throw new Error(`${product.id} has no usage price`);
	return price;
};

const getUsageConfig = ({ product }: { product: FullProduct }) =>
	getUsagePrice({ product }).config as UsagePriceConfig;

test.concurrent(
	`${chalk.yellowBright("stripe resources: adopts a legacy Product and shares it across every paid feature flow")}`,
	async () => {
		const feature = await ensureFeature({ id: featureId, name: "AI Credits" });

		const legacy = products.pro({
			id: "shared-legacy",
			items: [
				{
					...items.prepaid({ featureId, price: 5 }),
					feature_type: ProductItemFeatureType.SingleUse,
				},
			],
		});
		const plans = [
			legacy,
			products.premium({
				id: "shared-consumable",
				items: [
					{
						...items.consumable({ featureId, price: 0.1 }),
						feature_type: ProductItemFeatureType.SingleUse,
					},
				],
			}),
			products.growth({
				id: "shared-prepaid",
				items: [
					{
						...items.prepaid({ featureId, price: 4, includedUsage: 100 }),
						feature_type: ProductItemFeatureType.SingleUse,
					},
				],
			}),
			products.ultra({
				id: "shared-allocated",
				items: [
					constructArrearProratedItem({
						featureId,
						featureType: ProductItemFeatureType.SingleUse,
						includedUsage: 2,
					}),
				],
			}),
			products.oneOff({
				id: "shared-tiered-one-off",
				items: [
					{
						...constructPrepaidItem({
							featureId,
							tiers: [
								{ to: 500, amount: 10 },
								{ to: "inf", amount: 5 },
							],
							isOneOff: true,
						}),
						feature_type: ProductItemFeatureType.SingleUse,
					},
				],
			}),
		];

		const existing = await ProductService.listFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			returnAll: true,
			inIds: plans.map((plan) => plan.id),
		});
		await Promise.all(
			existing.map((plan) =>
				ProductService.deleteByInternalId({
					db: ctx.db,
					internalId: plan.internal_id,
					orgId: ctx.org.id,
					env: ctx.env,
				}),
			),
		);
		for (const plan of plans) {
			await createProduct({
				ctx,
				data: {
					...plan,
					free_trial: plan.free_trial ?? null,
					create_in_stripe: false,
				} as CreateProductV2Params,
			});
		}

		const before = await Promise.all(
			plans.map((plan) => getProduct({ productId: plan.id })),
		);
		const legacyPrice = getUsagePrice({ product: before[0] });
		const stripeLegacyProduct = await ctx.stripeCli.products.create({
			name: `${before[0].name} - ${feature.name}`,
		});
		const stripeLegacyPrice = await ctx.stripeCli.prices.create({
			product: stripeLegacyProduct.id,
			currency: ctx.org.default_currency ?? "usd",
			unit_amount: 500,
			recurring: { interval: "month" },
		});
		await PriceService.updateConfig({
			db: ctx.db,
			id: legacyPrice.id,
			config: {
				...(legacyPrice.config as UsagePriceConfig),
				stripe_product_id: stripeLegacyProduct.id,
				stripe_price_id: stripeLegacyPrice.id,
				stripe_prepaid_price_v2_id: stripeLegacyPrice.id,
			},
		});
		const initializedLegacy = await getProduct({ productId: legacy.id });

		await initStripeResourcesForProducts({
			ctx,
			products: [initializedLegacy, ...before.slice(1)],
		});

		const after = await Promise.all(
			plans.map((plan) => getProduct({ productId: plan.id })),
		);
		const planProductIds = after.map((plan) => plan.processor?.id);
		const featureProductIds = after.map(
			(plan) => getUsageConfig({ product: plan }).stripe_product_id,
		);
		const legacyConfig = getUsageConfig({ product: after[0] });

		expect(planProductIds.every(Boolean)).toBe(true);
		expect(new Set(planProductIds).size).toBe(plans.length);
		expect(featureProductIds).toEqual(
			Array(plans.length).fill(stripeLegacyProduct.id),
		);
		expect(planProductIds).not.toContain(stripeLegacyProduct.id);
		expect(legacyConfig.stripe_price_id).toBe(stripeLegacyPrice.id);

		const stripeFeatureProduct = await ctx.stripeCli.products.retrieve(
			stripeLegacyProduct.id,
		);
		expect(stripeFeatureProduct.name).toBe(feature.name);

		for (const plan of after.slice(1, 4)) {
			const config = getUsageConfig({ product: plan });
			expect(config.stripe_price_id).toBeTruthy();
			const stripePrice = await ctx.stripeCli.prices.retrieve(
				config.stripe_price_id!,
			);
			expect(stripePrice.product).toBe(stripeLegacyProduct.id);
			expect(stripePrice.nickname).toBe(`Autumn Price (${plan.name})`);
		}
	},
);
