import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	type FullProduct,
} from "@autumn/shared";
import {
	findFeaturePrice,
	stripeConfigValue,
} from "@tests/integration/utils/expectStripePriceResources.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { withCatalogPlans } from "../licenses/utils/seedLicensePlans.js";

const getFull = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}): Promise<FullProduct> =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

const prepaidItem = ({
	included,
	priceId,
}: {
	included: number;
	priceId?: string;
}) => ({
	feature_id: TestFeature.Messages,
	included,
	price: {
		amount: 10,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: 100,
		...(priceId ? { processors: { stripe: { price_id: priceId } } } : {}),
	},
});

const v2PriceIdOf = ({ product }: { product: FullProduct }): string | null =>
	stripeConfigValue({
		price: findFeaturePrice({ product, featureId: TestFeature.Messages }),
		field: "stripe_prepaid_price_v2_id",
	});

const priceProductIdOf = ({
	product,
}: {
	product: FullProduct;
}): string | null =>
	stripeConfigValue({
		price: findFeaturePrice({ product, featureId: TestFeature.Messages }),
		field: "stripe_product_id",
	});

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors price: a supplied price id is adopted, not re-minted")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const donorId = uniqueTestId("cv2_price_adopt_src");
		const adopterId = uniqueTestId("cv2_price_adopt_dst");
		await withCatalogPlans({
			ctx,
			planIds: [donorId, adopterId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: donorId,
							name: "Price Adopt Donor",
							items: [prepaidItem({ included: 100 })],
						},
					],
				});
				const donor = await getFull({ ctx, planId: donorId });
				const donorPriceId = v2PriceIdOf({ product: donor });
				expect(donorPriceId, "donor minted a v2 price").toMatch(/^price_/);

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: adopterId,
							name: "Price Adopt Target",
							items: [
								prepaidItem({
									included: 100,
									priceId: donorPriceId ?? undefined,
								}),
							],
						},
					],
				});

				const adopter = await getFull({ ctx, planId: adopterId });
				expect(v2PriceIdOf({ product: adopter }), "adopted v2 price id").toBe(
					donorPriceId,
				);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors price: an unknown price id errors instead of minting")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_price_adopt_bad");
		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				const update = autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Price Adopt Bad",
							items: [
								prepaidItem({
									included: 100,
									priceId: "price_1NoSuchPriceExistsAtAll",
								}),
							],
						},
					],
				});
				await expect(update).rejects.toThrow();
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors price: zero-included prepaid keeps the supplied id")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const donorId = uniqueTestId("cv2_price_zero_src");
		const adopterId = uniqueTestId("cv2_price_zero_dst");
		await withCatalogPlans({
			ctx,
			planIds: [donorId, adopterId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: donorId,
							name: "Price Zero Donor",
							items: [prepaidItem({ included: 100 })],
						},
					],
				});
				const donorPriceId = v2PriceIdOf({
					product: await getFull({ ctx, planId: donorId }),
				});
				expect(donorPriceId, "donor minted a v2 price").toMatch(/^price_/);

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: adopterId,
							name: "Price Zero Target",
							items: [
								prepaidItem({
									included: 0,
									priceId: donorPriceId ?? undefined,
								}),
							],
						},
					],
				});

				const adopter = await getFull({ ctx, planId: adopterId });
				expect(
					v2PriceIdOf({ product: adopter }),
					"supplied id survives the zero-included alias",
				).toBe(donorPriceId);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors price: an adopted price records its own stripe product")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_price_prod");
		const externalProduct = await ctx.stripeCli.products.create({
			name: `External Product ${planId}`,
		});
		const externalPrice = await ctx.stripeCli.prices.create({
			product: externalProduct.id,
			currency: "usd",
			unit_amount: 1000,
			recurring: { interval: "month" },
		});

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Price Product Target",
							items: [
								prepaidItem({ included: 100, priceId: externalPrice.id }),
							],
						},
					],
				});

				const adopter = await getFull({ ctx, planId });
				expect(v2PriceIdOf({ product: adopter }), "adopted price id").toBe(
					externalPrice.id,
				);
				expect(
					priceProductIdOf({ product: adopter }),
					"adopted price's own product is recorded",
				).toBe(externalProduct.id);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors price: changing the price re-points its product")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_price_repoint");
		const makeExternal = async (label: string) => {
			const product = await ctx.stripeCli.products.create({
				name: `External ${label} ${planId}`,
			});
			const price = await ctx.stripeCli.prices.create({
				product: product.id,
				currency: "usd",
				unit_amount: 1000,
				recurring: { interval: "month" },
			});
			return { productId: product.id, priceId: price.id };
		};
		const first = await makeExternal("A");
		const second = await makeExternal("B");

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Price Repoint",
							items: [prepaidItem({ included: 100, priceId: first.priceId })],
						},
					],
				});
				const before = await getFull({ ctx, planId });
				expect(priceProductIdOf({ product: before }), "first product").toBe(
					first.productId,
				);

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							items: [prepaidItem({ included: 100, priceId: second.priceId })],
						},
					],
				});

				const after = await getFull({ ctx, planId });
				expect(v2PriceIdOf({ product: after }), "second price").toBe(
					second.priceId,
				);
				expect(priceProductIdOf({ product: after }), "product re-pointed").toBe(
					second.productId,
				);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors price: a usage-based price maps into the v1 slot with its meter")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_price_usage");
		const meter = await ctx.stripeCli.billing.meters.create({
			display_name: `External Meter ${planId}`,
			event_name: `external_events_${planId}`,
			default_aggregation: { formula: "sum" },
		});
		const product = await ctx.stripeCli.products.create({
			name: `External Usage ${planId}`,
		});
		const meteredPrice = await ctx.stripeCli.prices.create({
			product: product.id,
			currency: "usd",
			unit_amount: 5,
			recurring: { interval: "month", meter: meter.id, usage_type: "metered" },
		});

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Usage Price Adopt",
							items: [
								{
									feature_id: TestFeature.Messages,
									included: 0,
									price: {
										amount: 0.05,
										interval: BillingInterval.Month,
										billing_method: BillingMethod.UsageBased,
										billing_units: 1,
										processors: { stripe: { price_id: meteredPrice.id } },
									},
								},
							],
						},
					],
				});

				const price = findFeaturePrice({
					product: await getFull({ ctx, planId }),
					featureId: TestFeature.Messages,
				});
				expect(
					stripeConfigValue({ price, field: "stripe_price_id" }),
					"adopted usage price id",
				).toBe(meteredPrice.id);
				expect(
					stripeConfigValue({ price, field: "stripe_meter_id" }),
					"meter derived from the price",
				).toBe(meter.id);
				expect(
					stripeConfigValue({ price, field: "stripe_event_name" }),
					"event name derived from the meter",
				).toBe(meter.event_name);
			},
		});
	},
);
