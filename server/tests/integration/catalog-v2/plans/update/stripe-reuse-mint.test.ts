/**
 * catalogV2.update — Stripe id carry on versioning: "new_version" mint.
 *
 * Pre-seeds real Stripe resources via initPlanStripeResources, then mints v2
 * and asserts reuse levels. Plan-level processor.id is copied onto the v2 row.
 */

import { test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	type FullProduct,
	ResetInterval,
} from "@autumn/shared";
import {
	expectPriceStripeResourcesAbsent,
	expectPriceStripeReuseCorrect,
	expectProductProcessorCorrect,
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

const usageMessagesItem = ({ amount }: { amount: number }) => ({
	feature_id: TestFeature.Messages,
	included: 100,
	reset: { interval: ResetInterval.Month },
	price: {
		amount,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.UsageBased,
		billing_units: 1,
	},
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe mint: untouched paid item carries full stripe ids")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_str_nv_same");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Stripe Mint Same",
						items: [prepaidMessagesItem({ amount: 10 })],
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
						name: "Stripe Mint Same V2",
						items: [prepaidMessagesItem({ amount: 10 })],
						versioning: "new_version",
					},
				],
			});

			const after = await getFull({ ctx, planId, version: 2 });
			expectPriceStripeReuseCorrect({
				before: paidBefore,
				after: findFeaturePrice({
					product: after,
					featureId: TestFeature.Messages,
				}),
				reuse: "full",
				label: "mint untouched prepaid",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe mint: amount change carries product, not price id")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_str_nv_amt");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Stripe Mint Amt",
						items: [usageMessagesItem({ amount: 0.5 })],
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
						items: [usageMessagesItem({ amount: 0.9 })],
						versioning: "new_version",
					},
				],
			});

			const after = await getFull({ ctx, planId, version: 2 });
			expectPriceStripeReuseCorrect({
				before: paidBefore,
				after: findFeaturePrice({
					product: after,
					featureId: TestFeature.Messages,
				}),
				reuse: "stripeProductOnly",
				label: "mint usage amount change",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe mint: new paid item has no stripe ids; processor.id carried")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_str_nv_new");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Stripe Mint New",
						price: { amount: 20, interval: BillingInterval.Month },
						items: [{ feature_id: TestFeature.Dashboard }],
					},
				],
			});

			const before = await initPlanStripeResources({ ctx, planId });
			expectProductProcessorCorrect({ product: before, present: true });
			const processorId = before.processor?.id ?? null;

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{ feature_id: TestFeature.Dashboard },
							prepaidMessagesItem({ amount: 10 }),
						],
						versioning: "new_version",
					},
				],
			});

			const after = await getFull({ ctx, planId, version: 2 });
			expectPriceStripeResourcesAbsent({
				price: findFeaturePrice({
					product: after,
					featureId: TestFeature.Messages,
				}),
				label: "newly added paid item on mint",
			});
			expectProductProcessorCorrect({
				product: after,
				processorId,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
