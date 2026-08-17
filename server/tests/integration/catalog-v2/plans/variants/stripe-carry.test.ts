/**
 * catalogV2.update — Stripe id carry onto variant_link creates.
 *
 * A declared variant clones the folded base, so its processor and matching
 * price rows must carry the base's Stripe ids (compute-phase stamp, no
 * Stripe IO). Reuse levels follow getPriceStripeReuseLevel.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	type FullProduct,
} from "@autumn/shared";
import {
	expectPriceStripeReuseCorrect,
	expectPriceStripeResourcesPresent,
	expectProductProcessorCorrect,
	findBasePrice,
	findFeaturePrice,
	stripeConfigValue,
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

const seedTeamWithStripe = async ({
	autumnV2_3,
	ctx,
	baseId,
}: {
	autumnV2_3: { catalogV2: { update: (params: object) => Promise<unknown> } };
	ctx: AutumnContext;
	baseId: string;
}): Promise<FullProduct> => {
	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: baseId,
				name: "Team",
				price: { amount: 20, interval: BillingInterval.Month },
				items: [prepaidMessagesItem({ amount: 10 })],
			},
		],
	});
	return initPlanStripeResources({ ctx, planId: baseId });
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants stripe: declared variant carries processor and full price ids")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_vstr_full_b");
		const variantId = uniqueTestId("cv2_vstr_full_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			const base = await seedTeamWithStripe({ autumnV2_3, ctx, baseId });
			expectProductProcessorCorrect({ product: base, present: true });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [{ variant_plan_id: variantId, name: "Team EU" }],
					},
				],
			});

			const variant = await getFull({ ctx, planId: variantId });
			expectProductProcessorCorrect({
				product: variant,
				processorId: base.processor?.id,
			});
			expectPriceStripeReuseCorrect({
				before: findFeaturePrice({
					product: base,
					featureId: TestFeature.Messages,
				})!,
				after: findFeaturePrice({
					product: variant,
					featureId: TestFeature.Messages,
				}),
				reuse: "full",
				label: "variant unchanged prepaid",
			});
			expectPriceStripeReuseCorrect({
				before: findBasePrice({ product: base })!,
				after: findBasePrice({ product: variant }),
				reuse: "full",
				label: "variant unchanged base",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants stripe: customized prepaid amount carries product ids only")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_vstr_amt_b");
		const variantId = uniqueTestId("cv2_vstr_amt_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			const base = await seedTeamWithStripe({ autumnV2_3, ctx, baseId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [
							{
								variant_plan_id: variantId,
								name: "Team EU",
								customize: {
									remove_items: [
										{
											feature_id: TestFeature.Messages,
											billing_method: BillingMethod.Prepaid,
										},
									],
									add_items: [prepaidMessagesItem({ amount: 20 })],
								},
							},
						],
					},
				],
			});

			const variant = await getFull({ ctx, planId: variantId });
			expectProductProcessorCorrect({
				product: variant,
				processorId: base.processor?.id,
			});
			expectPriceStripeReuseCorrect({
				before: findFeaturePrice({
					product: base,
					featureId: TestFeature.Messages,
				})!,
				after: findFeaturePrice({
					product: variant,
					featureId: TestFeature.Messages,
				}),
				reuse: "stripeProductOnly",
				label: "variant prepaid amount change",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants stripe: allowance-only customize carries product ids only")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_vstr_allow_b");
		const variantId = uniqueTestId("cv2_vstr_allow_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			const base = await seedTeamWithStripe({ autumnV2_3, ctx, baseId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [
							{
								variant_plan_id: variantId,
								name: "Team EU",
								customize: {
									remove_items: [
										{
											feature_id: TestFeature.Messages,
											billing_method: BillingMethod.Prepaid,
										},
									],
									add_items: [
										{
											...prepaidMessagesItem({ amount: 10 }),
											included: 500,
										},
									],
								},
							},
						],
					},
				],
			});

			const variant = await getFull({ ctx, planId: variantId });
			expectProductProcessorCorrect({
				product: variant,
				processorId: base.processor?.id,
			});
			// Allowance is part of the paired entitlement, so full reuse is off
			// the table — only the per-feature Stripe Product/meter carries.
			expectPriceStripeReuseCorrect({
				before: findFeaturePrice({
					product: base,
					featureId: TestFeature.Messages,
				})!,
				after: findFeaturePrice({
					product: variant,
					featureId: TestFeature.Messages,
				}),
				reuse: "stripeProductOnly",
				label: "variant allowance-only change",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants stripe: added feature item gets its own stripe product")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_vstr_addf_b");
		const variantId = uniqueTestId("cv2_vstr_addf_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			const base = await seedTeamWithStripe({ autumnV2_3, ctx, baseId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [
							{
								variant_plan_id: variantId,
								name: "Team EU",
								customize: {
									add_items: [
										{
											feature_id: TestFeature.Words,
											included: 0,
											price: {
												amount: 5,
												interval: BillingInterval.Month,
												billing_method: BillingMethod.Prepaid,
												billing_units: 100,
											},
										},
									],
								},
							},
						],
					},
				],
			});

			const variant = await getFull({ ctx, planId: variantId });
			expectPriceStripeReuseCorrect({
				before: findFeaturePrice({
					product: base,
					featureId: TestFeature.Messages,
				})!,
				after: findFeaturePrice({
					product: variant,
					featureId: TestFeature.Messages,
				}),
				reuse: "full",
				label: "variant untouched prepaid",
			});
			const wordsPrice = findFeaturePrice({
				product: variant,
				featureId: TestFeature.Words,
			});
			expectPriceStripeResourcesPresent({
				price: wordsPrice,
				label: "added words item",
			});
			expect(
				stripeConfigValue({ price: wordsPrice, field: "stripe_product_id" }),
				"different feature must not share the messages stripe product",
			).not.toBe(
				stripeConfigValue({
					price: findFeaturePrice({
						product: variant,
						featureId: TestFeature.Messages,
					}),
					field: "stripe_product_id",
				}),
			);
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants stripe: follow carries from the variant's own rows, not the base")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_vstr_flw_b");
		const variantId = uniqueTestId("cv2_vstr_flw_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			const base = await seedTeamWithStripe({ autumnV2_3, ctx, baseId });

			// EU drifts: its prepaid amount differs, so init mints EU its own price.
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [
							{
								variant_plan_id: variantId,
								name: "Team EU",
								customize: {
									remove_items: [
										{
											feature_id: TestFeature.Messages,
											billing_method: BillingMethod.Prepaid,
										},
									],
									add_items: [prepaidMessagesItem({ amount: 15 })],
								},
							},
						],
					},
				],
			});
			const variantBefore = await getFull({ ctx, planId: variantId });
			const driftedPrice = findFeaturePrice({
				product: variantBefore,
				featureId: TestFeature.Messages,
			})!;

			// Follow overwrite: EU's new row is priced like Team's, but carry must
			// run against EU's CURRENT rows — amount 15 → 10 is productOnly.
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						items: [{ ...prepaidMessagesItem({ amount: 10 }), included: 200 }],
						propagate: { variants: [{ plan_id: variantId }] },
					},
				],
			});

			const variantAfter = await getFull({ ctx, planId: variantId });
			expectProductProcessorCorrect({
				product: variantAfter,
				processorId: base.processor?.id,
			});
			expectPriceStripeReuseCorrect({
				before: driftedPrice,
				after: findFeaturePrice({
					product: variantAfter,
					featureId: TestFeature.Messages,
				}),
				reuse: "stripeProductOnly",
				label: "followed variant vs its own drifted row",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants stripe: customized base price carries nothing on base, full on items")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_vstr_base_b");
		const variantId = uniqueTestId("cv2_vstr_base_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			const base = await seedTeamWithStripe({ autumnV2_3, ctx, baseId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [
							{
								variant_plan_id: variantId,
								name: "Team EU",
								customize: {
									price: { amount: 40, interval: BillingInterval.Month },
								},
							},
						],
					},
				],
			});

			const variant = await getFull({ ctx, planId: variantId });
			expectProductProcessorCorrect({
				product: variant,
				processorId: base.processor?.id,
			});
			// No carry for a changed fixed price — init mints a FRESH Stripe
			// Price (under the shared family product), never the base's.
			expect(
				stripeConfigValue({
					price: findBasePrice({ product: variant }),
					field: "stripe_price_id",
				}),
				"variant base must not reuse the base's stripe price",
			).not.toBe(
				stripeConfigValue({
					price: findBasePrice({ product: base })!,
					field: "stripe_price_id",
				}),
			);
			expectPriceStripeReuseCorrect({
				before: findFeaturePrice({
					product: base,
					featureId: TestFeature.Messages,
				})!,
				after: findFeaturePrice({
					product: variant,
					featureId: TestFeature.Messages,
				}),
				reuse: "full",
				label: "variant untouched prepaid",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
