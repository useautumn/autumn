/**
 * catalogV2.update — execute-phase Stripe resource init.
 *
 * After DB writes, missing Stripe objects are created (sandbox) or reused
 * (variant family, license child). `create_in_stripe: false` copies ids but
 * never creates; free plans never mint a Stripe Product of their own.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	type FullProduct,
} from "@autumn/shared";
import { getFullLicenseProduct } from "@tests/integration/licenses/catalog-update/utils/getFullLicenseProduct.js";
import {
	expectPriceStripeReuseCorrect,
	expectPriceStripeResourcesAbsent,
	expectPriceStripeResourcesPresent,
	expectProductProcessorCorrect,
	findBasePrice,
	findFeaturePrice,
	stripeConfigValue,
} from "@tests/integration/utils/expectStripePriceResources.js";
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
	`${chalk.yellowBright("catalogV2 stripe init: paid plan create mints stripe product and prices")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_sini_paid");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Init Paid",
						price: { amount: 20, interval: BillingInterval.Month },
						items: [prepaidMessagesItem({ amount: 10 })],
					},
				],
			});

			const plan = await getFull({ ctx, planId });
			expectProductProcessorCorrect({ product: plan, present: true });
			expectPriceStripeResourcesPresent({
				price: findBasePrice({ product: plan }),
				label: "created base price",
			});
			expectPriceStripeResourcesPresent({
				price: findFeaturePrice({
					product: plan,
					featureId: TestFeature.Messages,
				}),
				label: "created prepaid price",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe init: create_in_stripe false creates nothing")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_sini_skip");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Init Skip",
						price: { amount: 20, interval: BillingInterval.Month },
						items: [prepaidMessagesItem({ amount: 10 })],
						create_in_stripe: false,
					},
				],
			});

			const plan = await getFull({ ctx, planId });
			expectProductProcessorCorrect({ product: plan, present: false });
			expectPriceStripeResourcesAbsent({
				price: findBasePrice({ product: plan }),
				label: "skipped base price",
			});
			expectPriceStripeResourcesAbsent({
				price: findFeaturePrice({
					product: plan,
					featureId: TestFeature.Messages,
				}),
				label: "skipped prepaid price",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe init: free plan create mints no stripe product")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_sini_free");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Init Free",
						items: [{ feature_id: TestFeature.Dashboard }],
					},
				],
			});

			const plan = await getFull({ ctx, planId });
			expectProductProcessorCorrect({ product: plan, present: false });
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe init: same-call base + variant share one stripe product")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_sini_fam_b");
		const variantId = uniqueTestId("cv2_sini_fam_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						name: "Team",
						price: { amount: 20, interval: BillingInterval.Month },
						items: [prepaidMessagesItem({ amount: 10 })],
						variants: [{ variant_plan_id: variantId, name: "Team EU" }],
					},
				],
			});

			const base = await getFull({ ctx, planId: baseId });
			const variant = await getFull({ ctx, planId: variantId });
			expectProductProcessorCorrect({ product: base, present: true });
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
				label: "variant shares created prepaid",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe init: three-member family shares one stripe product")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_sini_tri_b");
		const euId = uniqueTestId("cv2_sini_tri_eu");
		const ukId = uniqueTestId("cv2_sini_tri_uk");
		await deleteDbPlans({ ctx, planIds: [baseId, euId, ukId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						name: "Team",
						items: [prepaidMessagesItem({ amount: 10 })],
						variants: [
							{ variant_plan_id: euId, name: "Team EU" },
							{ variant_plan_id: ukId, name: "Team UK" },
						],
					},
				],
			});

			const base = await getFull({ ctx, planId: baseId });
			const eu = await getFull({ ctx, planId: euId });
			const uk = await getFull({ ctx, planId: ukId });
			expectProductProcessorCorrect({ product: base, present: true });
			expectProductProcessorCorrect({
				product: eu,
				processorId: base.processor?.id,
			});
			expectProductProcessorCorrect({
				product: uk,
				processorId: base.processor?.id,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, euId, ukId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe init: added paid item on an un-inited plan gets stripe ids")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_sini_add");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Init Add",
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

			const plan = await getFull({ ctx, planId });
			expectProductProcessorCorrect({ product: plan, present: true });
			expectPriceStripeResourcesPresent({
				price: findFeaturePrice({
					product: plan,
					featureId: TestFeature.Messages,
				}),
				label: "added prepaid item",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe init: zero-amount base price mints nothing")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_sini_zero");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Init Zero",
						price: { amount: 0, interval: BillingInterval.Month },
						items: [{ feature_id: TestFeature.Dashboard }],
					},
				],
			});

			const plan = await getFull({ ctx, planId });
			expectProductProcessorCorrect({ product: plan, present: false });
			expectPriceStripeResourcesAbsent({
				price: findBasePrice({ product: plan }),
				label: "zero-amount base price",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe init: new_version mint of an un-inited plan inits only the new version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_sini_mint");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Init Mint",
						price: { amount: 20, interval: BillingInterval.Month },
						create_in_stripe: false,
					},
				],
			});

			// Draft mint — omit active so v1 is not demoted (demotion upsert inits v1 too).
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						price: { amount: 30, interval: BillingInterval.Month },
						versioning: "new_version",
					},
				],
			});

			const v1 = await getFull({ ctx, planId, version: 1 });
			const v2 = await getFull({ ctx, planId, version: 2 });
			expectProductProcessorCorrect({ product: v1, present: false });
			expectPriceStripeResourcesAbsent({
				price: findBasePrice({ product: v1 }),
				label: "v1 stays un-inited",
			});
			expectProductProcessorCorrect({ product: v2, present: true });
			expectPriceStripeResourcesPresent({
				price: findBasePrice({ product: v2 }),
				label: "v2 base price",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe init: same-call parent + child inits overlay under the child")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_sini_lic_p");
		const childId = uniqueTestId("cv2_sini_lic_c");
		await deleteDbPlans({ ctx, planIds: [parentId, childId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: childId,
						name: "Seat",
						price: { amount: 10, interval: BillingInterval.Month },
					},
					{
						plan_id: parentId,
						name: "Parent",
						licenses: [
							{
								license_plan_id: childId,
								included: 2,
								customize: {
									price: { amount: 25, interval: BillingInterval.Month },
								},
							},
						],
					},
				],
			});

			const child = await getFull({ ctx, planId: childId });
			expectProductProcessorCorrect({ product: child, present: true });
			const stockBase = findBasePrice({ product: child })!;
			expectPriceStripeResourcesPresent({
				price: stockBase,
				label: "child stock base",
			});

			const linked = await getFullLicenseProduct({
				ctx,
				parentPlanId: parentId,
				licensePlanId: childId,
			});
			const overlayBase = findBasePrice({
				product: linked.fullLicenseProduct,
			})!;
			expect(overlayBase.is_custom, "overlay base is custom").toBe(true);
			expectPriceStripeResourcesPresent({
				price: overlayBase,
				label: "overlay base",
			});
			expect(
				stripeConfigValue({ price: overlayBase, field: "stripe_price_id" }),
				"overlay mints its own stripe price",
			).not.toBe(
				stripeConfigValue({ price: stockBase, field: "stripe_price_id" }),
			);
		} finally {
			await deleteDbPlans({ ctx, planIds: [parentId, childId] });
		}
	},
);
