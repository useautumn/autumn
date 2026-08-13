/**
 * catalogV2.update — Stripe id carry-forward on entitlement/price rows.
 *
 * Seeds real Stripe resources via `initStripeResourcesForProducts` (the same
 * production path `updateProduct` uses), then updates via catalogV2 and
 * asserts reuse levels with shared expect helpers.
 *
 * Full carry (stripe_price_id + stripe_product_id + meter) when price AND
 * entitlement definitions match; product-only carry when same usage feature +
 * entity scope; otherwise nothing.
 */

import { test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	type FullProduct,
	ResetInterval,
	TierBehavior,
	TierInfinite,
} from "@autumn/shared";
import {
	expectPriceStripeResourcesAbsent,
	expectPriceStripeReuseCorrect,
	expectProductProcessorCorrect,
	findBasePrice,
	findFeaturePrice,
} from "@tests/integration/utils/expectStripePriceResources.js";
import { initPlanStripeResources } from "@tests/integration/utils/initPlanStripeResources.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";

const getFull = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
}): Promise<FullProduct> =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

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

			const before = await initPlanStripeResources({ ctx, planId });
			const paidBefore = findFeaturePrice({
				product: before,
				featureId: TestFeature.Messages,
			})!;
			expectProductProcessorCorrect({ product: before, present: true });

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
			const paidAfter = findFeaturePrice({
				product: after,
				featureId: TestFeature.Messages,
			});
			expectPriceStripeReuseCorrect({
				before: paidBefore,
				after: paidAfter,
				reuse: "full",
				label: "unchanged prepaid",
			});
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

			const before = await initPlanStripeResources({ ctx, planId });
			const paidBefore = findFeaturePrice({
				product: before,
				featureId: TestFeature.Messages,
			})!;
			const baseBefore = findBasePrice({ product: before })!;

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Stripe Details Renamed" }],
			});

			const after = await getFull({ ctx, planId });
			expectPriceStripeReuseCorrect({
				before: paidBefore,
				after: findFeaturePrice({
					product: after,
					featureId: TestFeature.Messages,
				}),
				reuse: "full",
				label: "details-only paid",
			});
			expectPriceStripeReuseCorrect({
				before: baseBefore,
				after: findBasePrice({ product: after }),
				reuse: "full",
				label: "details-only base",
			});
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

			const before = await initPlanStripeResources({ ctx, planId });
			const paidBefore = findFeaturePrice({
				product: before,
				featureId: TestFeature.Messages,
			})!;

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
			expectPriceStripeReuseCorrect({
				before: paidBefore,
				after: findFeaturePrice({
					product: after,
					featureId: TestFeature.Messages,
				}),
				reuse: "stripeProductOnly",
				label: "usage amount change",
			});
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

			const before = await initPlanStripeResources({ ctx, planId });
			const paidBefore = findFeaturePrice({
				product: before,
				featureId: TestFeature.Messages,
			})!;

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [prepaidMessagesItem({ amount: 20 })],
					},
				],
			});

			const after = await getFull({ ctx, planId });
			expectPriceStripeReuseCorrect({
				before: paidBefore,
				after: findFeaturePrice({
					product: after,
					featureId: TestFeature.Messages,
				}),
				reuse: "stripeProductOnly",
				label: "prepaid amount change",
			});
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

			const before = await initPlanStripeResources({ ctx, planId });
			const paidBefore = findFeaturePrice({
				product: before,
				featureId: TestFeature.Messages,
			})!;

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
			expectPriceStripeReuseCorrect({
				before: paidBefore,
				after: findFeaturePrice({
					product: after,
					featureId: TestFeature.Messages,
				}),
				reuse: "stripeProductOnly",
				label: "graduated→volume",
			});
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

			const before = await initPlanStripeResources({ ctx, planId });
			const baseBefore = findBasePrice({ product: before })!;

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						price: { amount: 40, interval: BillingInterval.Month },
					},
				],
			});

			const after = await getFull({ ctx, planId });
			const baseAfter = findBasePrice({ product: after });
			expectPriceStripeReuseCorrect({
				before: baseBefore,
				after: baseAfter,
				reuse: "none",
				label: "base amount change",
			});
			expectPriceStripeResourcesAbsent({
				price: baseAfter,
				label: "new base row",
			});
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
			expectPriceStripeResourcesAbsent({
				price: findFeaturePrice({
					product: after,
					featureId: TestFeature.Messages,
				}),
				label: "newly added paid item",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe: new_version mint carries full stripe ids on matching item")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_str_nv");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Stripe Mint",
						items: [prepaidMessagesItem({ amount: 10 })],
					},
				],
			});
			const before = await initPlanStripeResources({ ctx, planId });
			const priceBefore = findFeaturePrice({
				product: before,
				featureId: TestFeature.Messages,
			})!;

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Stripe Mint V2",
						items: [prepaidMessagesItem({ amount: 10 })],
						versioning: "new_version",
					},
				],
			});

			const after = await getFull({ ctx, planId, version: 2 });
			expectPriceStripeReuseCorrect({
				before: priceBefore,
				after: findFeaturePrice({
					product: after,
					featureId: TestFeature.Messages,
				}),
				reuse: "full",
				label: "new_version mint matching prepaid item",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
