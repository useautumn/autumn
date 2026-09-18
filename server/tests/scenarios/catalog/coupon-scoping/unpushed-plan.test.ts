import { test } from "bun:test";
import { BillingInterval, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { logPlaybook, resetCatalogPlans } from "../utils/catalogScenario.js";

const unpushedId = "qa-cpn-unpushed";

test(`${chalk.yellowBright("coupon-qa: plan that does not exist in Stripe yet")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	await resetCatalogPlans({ ctx, planIds: [unpushedId] });

	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: unpushedId,
				name: "QA Coupon Unpushed",
				price: { amount: 12, interval: BillingInterval.Month },
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 50,
						reset: { interval: ResetInterval.Month },
					},
				],
			},
		],
	});

	// Drop the Stripe mapping so the plan looks like one that was never attached.
	const plan = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: unpushedId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	await ProductService.updateByInternalId({
		db: ctx.db,
		internalId: plan.internal_id,
		update: { processor: null },
	});

	logPlaybook({
		title: `${unpushedId} exists in Autumn with no Stripe product`,
		steps: [
			`Developer > Stripe > Stripe product mappings: this plan shows as unmapped.`,
			`Products > Rewards > create a coupon scoped to this plan and save.`,
			`It must succeed. The old "Plan X doesn't exist in Stripe yet. Call attach..." error must NOT appear.`,
			`Refresh the Stripe mappings page: the plan now has a Stripe product, created on the spot.`,
			`In Stripe, the coupon's applies_to.products points at that newly created product.`,
			`Re-run this file to reset the plan to unmapped and try the same flow from the edit sheet.`,
		],
	});
});
