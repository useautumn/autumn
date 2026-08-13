/**
 * catalogV2.update — Stripe id carry-forward on entitlement/price rows.
 *
 * Full carry (stripe_price_id + stripe_product_id + meter) when price AND
 * entitlement definitions match; product-only carry when same usage feature +
 * entity scope; otherwise nothing.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	type FullProduct,
	findPriceByFeatureId,
	isFixedPrice,
	type Price,
	ResetInterval,
	TierBehavior,
	TierInfinite,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";

type StripeConfig = {
	stripe_product_id?: string | null;
	stripe_price_id?: string | null;
	stripe_meter_id?: string | null;
};

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

const seedPriceStripe = async ({
	ctx,
	price,
	stripeProductId,
	stripePriceId,
	stripeMeterId,
}: {
	ctx: AutumnContext;
	price: Price;
	stripeProductId?: string;
	stripePriceId?: string;
	stripeMeterId?: string;
}) => {
	await PriceService.update({
		db: ctx.db,
		id: price.id,
		update: {
			config: {
				...price.config,
				...(stripeProductId !== undefined
					? { stripe_product_id: stripeProductId }
					: {}),
				...(stripePriceId !== undefined
					? { stripe_price_id: stripePriceId }
					: {}),
				...(stripeMeterId !== undefined
					? { stripe_meter_id: stripeMeterId }
					: {}),
			} as Price["config"],
		},
	});
};

const priceConfig = ({
	product,
	featureId,
}: {
	product: FullProduct;
	featureId: string;
}): StripeConfig => {
	const price = findPriceByFeatureId({
		prices: product.prices,
		featureId,
	});
	if (!price) throw new Error(`missing price for ${featureId}`);
	return price.config as StripeConfig;
};

const prepaidMessagesItem = ({ amount }: { amount: number }) => ({
	feature_id: TestFeature.Messages,
	included: 0,
	price: {
		amount,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: 100,
	},
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe: unchanged paid item carries full stripe ids")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_str_same");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Stripe Same",
						items: [
							prepaidMessagesItem({ amount: 10 }),
							{ feature_id: TestFeature.Dashboard },
						],
					},
				],
			});

			const before = await getFull({ ctx, planId });
			const paid = findPriceByFeatureId({
				prices: before.prices,
				featureId: TestFeature.Messages,
			})!;
			const stripeProductId = `prod_${planId}`;
			const stripePriceId = `price_${planId}`;
			await seedPriceStripe({
				ctx,
				price: paid,
				stripeProductId,
				stripePriceId,
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Stripe Same Renamed",
						items: [
							prepaidMessagesItem({ amount: 10 }),
							{ feature_id: TestFeature.Dashboard },
						],
					},
				],
			});

			const after = await getFull({ ctx, planId });
			const config = priceConfig({
				product: after,
				featureId: TestFeature.Messages,
			});
			expect(config.stripe_product_id).toBe(stripeProductId);
			expect(config.stripe_price_id).toBe(stripePriceId);
			const afterPaid = findPriceByFeatureId({
				prices: after.prices,
				featureId: TestFeature.Messages,
			});
			expect(afterPaid?.id).toBe(paid.id);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe: details-only update carries all stripe ids")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_str_det");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Stripe Details",
						price: { amount: 20, interval: BillingInterval.Month },
						items: [prepaidMessagesItem({ amount: 5 })],
					},
				],
			});

			const before = await getFull({ ctx, planId });
			const paid = findPriceByFeatureId({
				prices: before.prices,
				featureId: TestFeature.Messages,
			})!;
			const base = before.prices.find(isFixedPrice)!;
			await seedPriceStripe({
				ctx,
				price: paid,
				stripeProductId: `prod_paid_${planId}`,
				stripePriceId: `price_paid_${planId}`,
			});
			await seedPriceStripe({
				ctx,
				price: base,
				stripeProductId: `prod_base_${planId}`,
				stripePriceId: `price_base_${planId}`,
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Stripe Details Renamed" }],
			});

			const after = await getFull({ ctx, planId });
			const paidConfig = priceConfig({
				product: after,
				featureId: TestFeature.Messages,
			});
			const afterBase = after.prices.find(isFixedPrice)!;
			expect(paidConfig.stripe_product_id).toBe(`prod_paid_${planId}`);
			expect(paidConfig.stripe_price_id).toBe(`price_paid_${planId}`);
			expect((afterBase.config as StripeConfig).stripe_product_id).toBe(
				`prod_base_${planId}`,
			);
			expect((afterBase.config as StripeConfig).stripe_price_id).toBe(
				`price_base_${planId}`,
			);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe: amount change carries product, not price id")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_str_amt");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Stripe Amt",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
								price: {
									amount: 0.5,
									interval: BillingInterval.Month,
									billing_method: BillingMethod.UsageBased,
									billing_units: 1,
								},
							},
						],
					},
				],
			});

			const before = await getFull({ ctx, planId });
			const paid = findPriceByFeatureId({
				prices: before.prices,
				featureId: TestFeature.Messages,
			})!;
			const stripeProductId = `prod_${planId}`;
			const stripePriceId = `price_${planId}`;
			const stripeMeterId = `meter_${planId}`;
			await seedPriceStripe({
				ctx,
				price: paid,
				stripeProductId,
				stripePriceId,
				stripeMeterId,
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
								price: {
									amount: 0.9,
									interval: BillingInterval.Month,
									billing_method: BillingMethod.UsageBased,
									billing_units: 1,
								},
							},
						],
					},
				],
			});

			const after = await getFull({ ctx, planId });
			const config = priceConfig({
				product: after,
				featureId: TestFeature.Messages,
			});
			expect(config.stripe_product_id).toBe(stripeProductId);
			expect(config.stripe_meter_id).toBe(stripeMeterId);
			expect(config.stripe_price_id).not.toBe(stripePriceId);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe: prepaid amount change does not reuse stripe_price_id")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_str_pp");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Stripe Prepaid",
						items: [prepaidMessagesItem({ amount: 10 })],
					},
				],
			});

			const before = await getFull({ ctx, planId });
			const paid = findPriceByFeatureId({
				prices: before.prices,
				featureId: TestFeature.Messages,
			})!;
			const stripePriceId = `price_${planId}`;
			await seedPriceStripe({
				ctx,
				price: paid,
				stripeProductId: `prod_${planId}`,
				stripePriceId,
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [prepaidMessagesItem({ amount: 20 })],
					},
				],
			});

			const after = await getFull({ ctx, planId });
			const config = priceConfig({
				product: after,
				featureId: TestFeature.Messages,
			});
			expect(config.stripe_product_id).toBe(`prod_${planId}`);
			expect(config.stripe_price_id).not.toBe(stripePriceId);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe: graduated → volume does not reuse stripe_price_id")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_str_tier");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Stripe Tiers",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								price: {
									tiers: [
										{ to: 600, amount: 10 },
										{ to: TierInfinite, amount: 5 },
									],
									interval: BillingInterval.Month,
									billing_method: BillingMethod.Prepaid,
									billing_units: 100,
								},
							},
						],
					},
				],
			});

			const before = await getFull({ ctx, planId });
			const paid = findPriceByFeatureId({
				prices: before.prices,
				featureId: TestFeature.Messages,
			})!;
			const stripePriceId = `price_${planId}`;
			await seedPriceStripe({
				ctx,
				price: paid,
				stripeProductId: `prod_${planId}`,
				stripePriceId,
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								price: {
									tiers: [
										{ to: 600, amount: 10 },
										{ to: TierInfinite, amount: 5 },
									],
									tier_behavior: TierBehavior.VolumeBased,
									interval: BillingInterval.Month,
									billing_method: BillingMethod.Prepaid,
									billing_units: 100,
								},
							},
						],
					},
				],
			});

			const after = await getFull({ ctx, planId });
			const config = priceConfig({
				product: after,
				featureId: TestFeature.Messages,
			});
			expect(config.stripe_price_id).not.toBe(stripePriceId);
			expect(config.stripe_product_id).toBe(`prod_${planId}`);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe: base price change mints new row; no stripe carry (fixed ≠ usage)")}`,
	async () => {
		// Product-only carry is usage-feature scoped (getPriceStripeReuseLevel);
		// fixed base amount changes get reuse level "none".
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_str_base");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Stripe Base",
						price: { amount: 20, interval: BillingInterval.Month },
						items: [{ feature_id: TestFeature.Dashboard }],
					},
				],
			});

			const before = await getFull({ ctx, planId });
			const base = before.prices.find(isFixedPrice)!;
			const stripeProductId = `prod_base_${planId}`;
			const stripePriceId = `price_base_${planId}`;
			await seedPriceStripe({
				ctx,
				price: base,
				stripeProductId,
				stripePriceId,
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						price: { amount: 40, interval: BillingInterval.Month },
					},
				],
			});

			const after = await getFull({ ctx, planId });
			const newBase = after.prices.find(isFixedPrice)!;
			expect(newBase.id).not.toBe(base.id);
			const config = newBase.config as StripeConfig;
			expect(config.stripe_product_id ?? null).toBeNull();
			expect(config.stripe_price_id ?? null).toBeNull();
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe: add new paid item → no stripe ids")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_str_new");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Stripe New",
						items: [{ feature_id: TestFeature.Dashboard }],
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{ feature_id: TestFeature.Dashboard },
							prepaidMessagesItem({ amount: 10 }),
						],
					},
				],
			});

			const after = await getFull({ ctx, planId });
			const config = priceConfig({
				product: after,
				featureId: TestFeature.Messages,
			});
			expect(config.stripe_product_id ?? null).toBeNull();
			expect(config.stripe_price_id ?? null).toBeNull();
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
