import { test } from "bun:test";
import { BillingInterval, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { logPlaybook, resetCatalogPlans } from "../utils/catalogScenario.js";

const proId = "qa-cpn-pro";
const yearlyId = "qa-cpn-pro-yearly";
const quarterlyId = "qa-cpn-pro-quarterly";
const soloId = "qa-cpn-solo";

test(`${chalk.yellowBright("coupon-qa: base + 2 variants on one Stripe product")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	const planIds = [proId, yearlyId, quarterlyId, soloId];
	await resetCatalogPlans({ ctx, planIds });

	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: proId,
				name: "QA Coupon Pro",
				price: { amount: 20, interval: BillingInterval.Month },
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 100,
						reset: { interval: ResetInterval.Month },
					},
				],
				variants: [
					{ variant_plan_id: yearlyId, name: "QA Coupon Pro Yearly" },
					{ variant_plan_id: quarterlyId, name: "QA Coupon Pro Quarterly" },
				],
			},
			{
				plan_id: soloId,
				name: "QA Coupon Solo",
				price: { amount: 15, interval: BillingInterval.Month },
				items: [
					{
						feature_id: TestFeature.Words,
						included: 500,
						reset: { interval: ResetInterval.Month },
					},
				],
			},
		],
	});

	logPlaybook({
		title: "Pro + Yearly + Quarterly share one Stripe product; Solo is its own",
		steps: [
			`Products > Rewards > create a coupon. The Products picker shows ONE row for "QA Coupon Pro + 2 plans", not three rows.`,
			`Tick that row → all three plans select together. Untick → all three clear. There must be no way to select only the variant.`,
			`The chip collapses to "QA Coupon Pro + 2 plans". Remove the chip → all three clear.`,
			`Hover the ⓘ on the grouped row → tooltip explains Stripe scopes coupons to products. Its link opens Developer > Stripe.`,
			`"${soloId}" appears as its own single row and can be selected alone.`,
			`Save a coupon on the Pro group → Stripe coupon's applies_to.products holds exactly one product id.`,
		],
	});
});
