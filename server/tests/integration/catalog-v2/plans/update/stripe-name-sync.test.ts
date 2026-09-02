/**
 * catalogV2.update — plan renames sync to the owned Stripe Product.
 *
 * A base plan owns its Stripe Product, so renaming the plan renames it.
 * A variant shares the base's Stripe Product and must never rename it.
 */

import { expect, test } from "bun:test";
import { BillingInterval, BillingMethod } from "@autumn/shared";
import { expectProductProcessorCorrect } from "@tests/integration/utils/expectStripePriceResources.js";
import { materializePlanInStripe } from "@tests/integration/utils/materializePlanInStripe.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";

const getStripeProductName = async ({
	ctx,
	stripeProductId,
}: {
	ctx: AutumnContext;
	stripeProductId: string;
}): Promise<string> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const stripeProduct = await stripeCli.products.retrieve(stripeProductId);
	return stripeProduct.name;
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
	`${chalk.yellowBright("catalogV2 stripe names: base rename updates the Stripe Product name")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_snm_base");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Name Sync",
						items: [prepaidMessagesItem({ amount: 10 })],
					},
				],
			});
			const before = await materializePlanInStripe({ ctx, planId });
			expectProductProcessorCorrect({ product: before, present: true });

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Name Sync Renamed" }],
			});

			expect(
				await getStripeProductName({
					ctx,
					stripeProductId: before.processor!.id,
				}),
				"base rename syncs the Stripe Product",
			).toBe("Name Sync Renamed");
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe names: variant rename leaves the shared Stripe Product alone")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_snm_var_b");
		const variantId = uniqueTestId("cv2_snm_var_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						name: "Team",
						items: [prepaidMessagesItem({ amount: 10 })],
						variants: [{ variant_plan_id: variantId, name: "Team EU" }],
					},
				],
			});
			// Base first so the variant reuses its Stripe Product rather than
			// minting one — sharing is what the rename must not disturb.
			const base = await materializePlanInStripe({ ctx, planId: baseId });
			await materializePlanInStripe({ ctx, planId: variantId });
			expectProductProcessorCorrect({ product: base, present: true });

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: variantId, name: "Team EU Renamed" }],
			});

			expect(
				await getStripeProductName({
					ctx,
					stripeProductId: base.processor!.id,
				}),
				"variant rename must not touch the shared Stripe Product",
			).toBe("Team");
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
