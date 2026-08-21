/**
 * catalogV2.update — variants[].customize.items PUT threads price / Stripe ids.
 *
 * Contract:
 *   create PUT with price.stripe_price_id stamps the variant price config
 *   create PUT of the same prepaid as a striped base → full Stripe carry
 *   edit PUT of the same items → entitlement_id / price_id stay put
 *   edit PUT changing the amount → stripe_price_id NOT reused (product only)
 *   edit PUT round-tripping the old stripe_price_id with a new amount → old id
 *   cleared and a fresh Stripe price minted (Stripe prices are immutable)
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	type FullProduct,
	isFixedPrice,
} from "@autumn/shared";
import {
	expectPriceStripeResourcesPresent,
	expectPriceStripeReuseCorrect,
	findFeaturePrice,
} from "@tests/integration/utils/expectStripePriceResources.js";
import { materializePlanInStripe } from "@tests/integration/utils/materializePlanInStripe.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";

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

const prepaidMessagesItem = ({
	amount,
	stripePriceId,
}: {
	amount: number;
	stripePriceId?: string;
}) => ({
	feature_id: TestFeature.Messages,
	included: 0,
	price: {
		...(stripePriceId !== undefined ? { stripe_price_id: stripePriceId } : {}),
		amount,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: 100,
	},
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: PUT items threads price.stripe_price_id")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_put_spid_b");
		const variantId = uniqueTestId("cv2_var_put_spid_v");
		const stripePriceId = `price_stub_${variantId}`;
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			// create_in_stripe: false — auto-init would replace a stub id that
			// doesn't resolve in Stripe; this asserts params → row threading only.
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						name: "Team",
						create_in_stripe: false,
						items: [prepaidMessagesItem({ amount: 10 })],
						variants: [
							{
								variant_plan_id: variantId,
								name: "Team EU",
								customize: {
									items: [
										prepaidMessagesItem({
											amount: 10,
											stripePriceId,
										}),
									],
								},
							},
						],
					},
				],
			});
			const variant = await getFull({ ctx, planId: variantId });
			const usagePrice = variant.prices.find((price) => !isFixedPrice(price));
			const config = usagePrice?.config as { stripe_price_id?: string | null };
			expect(config?.stripe_price_id).toBe(stripePriceId);
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: PUT same prepaid keeps Stripe and Autumn ids")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_put_ids_b");
		const variantId = uniqueTestId("cv2_var_put_ids_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						name: "Team",
						items: [prepaidMessagesItem({ amount: 10 })],
					},
				],
			});
			const base = await materializePlanInStripe({ ctx, planId: baseId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [
							{
								variant_plan_id: variantId,
								name: "Team EU",
								customize: {
									items: [prepaidMessagesItem({ amount: 10 })],
								},
							},
						],
					},
				],
			});

			const created = await getFull({ ctx, planId: variantId });
			expectPriceStripeReuseCorrect({
				before: findFeaturePrice({
					product: base,
					featureId: TestFeature.Messages,
				})!,
				after: findFeaturePrice({
					product: created,
					featureId: TestFeature.Messages,
				}),
				reuse: "full",
				label: "create PUT same prepaid",
			});
			const beforeEntIds = created.entitlements.map((ent) => ent.id).sort();
			const beforePriceIds = created.prices.map((price) => price.id).sort();

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [
							{
								variant_plan_id: variantId,
								customize: {
									items: [prepaidMessagesItem({ amount: 10 })],
								},
							},
						],
					},
				],
			});

			const edited = await getFull({ ctx, planId: variantId });
			expect(edited.entitlements.map((ent) => ent.id).sort()).toEqual(
				beforeEntIds,
			);
			expect(edited.prices.map((price) => price.id).sort()).toEqual(
				beforePriceIds,
			);
			expectPriceStripeReuseCorrect({
				before: findFeaturePrice({
					product: created,
					featureId: TestFeature.Messages,
				})!,
				after: findFeaturePrice({
					product: edited,
					featureId: TestFeature.Messages,
				}),
				reuse: "full",
				label: "edit PUT same prepaid",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: edit PUT amount change mints a new stripe price")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_edit_amt_b");
		const variantId = uniqueTestId("cv2_var_edit_amt_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						name: "Team",
						items: [prepaidMessagesItem({ amount: 10 })],
						variants: [
							{
								variant_plan_id: variantId,
								name: "Team EU",
								customize: {
									items: [prepaidMessagesItem({ amount: 10 })],
								},
							},
						],
					},
				],
			});
			await materializePlanInStripe({ ctx, planId: baseId });
			const before = await materializePlanInStripe({ ctx, planId: variantId });
			const beforePrice = findFeaturePrice({
				product: before,
				featureId: TestFeature.Messages,
			})!;

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [
							{
								variant_plan_id: variantId,
								customize: {
									items: [prepaidMessagesItem({ amount: 500 })],
								},
							},
						],
					},
				],
			});

			const edited = await getFull({ ctx, planId: variantId });
			expectPriceStripeReuseCorrect({
				before: beforePrice,
				after: findFeaturePrice({
					product: edited,
					featureId: TestFeature.Messages,
				}),
				reuse: "stripeProductOnly",
				label: "edit PUT amount change",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: edit PUT round-tripped stale stripe_price_id is not reused")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_edit_rt_b");
		const variantId = uniqueTestId("cv2_var_edit_rt_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						name: "Team",
						items: [prepaidMessagesItem({ amount: 10 })],
						variants: [
							{
								variant_plan_id: variantId,
								name: "Team EU",
								customize: {
									items: [prepaidMessagesItem({ amount: 10 })],
								},
							},
						],
					},
				],
			});
			await materializePlanInStripe({ ctx, planId: baseId });
			const before = await materializePlanInStripe({ ctx, planId: variantId });
			const beforePrice = findFeaturePrice({
				product: before,
				featureId: TestFeature.Messages,
			})!;
			const staleStripePriceId = (
				beforePrice.config as { stripe_price_id?: string | null }
			).stripe_price_id!;

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [
							{
								variant_plan_id: variantId,
								customize: {
									items: [
										prepaidMessagesItem({
											amount: 500,
											stripePriceId: staleStripePriceId,
										}),
									],
								},
							},
						],
					},
				],
			});

			const edited = await getFull({ ctx, planId: variantId });
			const editedPrice = findFeaturePrice({
				product: edited,
				featureId: TestFeature.Messages,
			});
			expectPriceStripeReuseCorrect({
				before: beforePrice,
				after: editedPrice,
				reuse: "stripeProductOnly",
				label: "edit PUT round-tripped stale id",
			});
			expectPriceStripeResourcesPresent({
				price: editedPrice,
				label: "edit PUT round-tripped stale id mints fresh",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: PUT prepaid amount change carries product ids only")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_put_amt_b");
		const variantId = uniqueTestId("cv2_var_put_amt_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						name: "Team",
						items: [prepaidMessagesItem({ amount: 10 })],
					},
				],
			});
			const base = await materializePlanInStripe({ ctx, planId: baseId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [
							{
								variant_plan_id: variantId,
								name: "Team EU",
								customize: {
									items: [prepaidMessagesItem({ amount: 20 })],
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
				reuse: "stripeProductOnly",
				label: "PUT prepaid amount change",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
