import { test } from "bun:test";
import { BillingInterval, BillingMethod } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { logPlaybook, resetCatalogPlans } from "../utils/catalogScenario.js";

const prepaidItem = ({
	featureId,
	amount,
}: {
	featureId: string;
	amount: number;
}) => ({
	feature_id: featureId,
	included: 0,
	price: {
		amount,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: 100,
	},
});

const usageAId = "qa-cpn-usage-a";
const usageBId = "qa-cpn-usage-b";
const otherFeatureId = "qa-cpn-usage-words";

test(`${chalk.yellowBright("coupon-qa: unrelated plans sharing a usage feature")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	const planIds = [usageAId, usageBId, otherFeatureId];
	await resetCatalogPlans({ ctx, planIds });

	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: usageAId,
				name: "QA Usage A",
				price: { amount: 10, interval: BillingInterval.Month },
				items: [prepaidItem({ featureId: TestFeature.Messages, amount: 5 })],
			},
			{
				plan_id: usageBId,
				name: "QA Usage B",
				price: { amount: 40, interval: BillingInterval.Month },
				items: [prepaidItem({ featureId: TestFeature.Messages, amount: 3 })],
			},
			{
				plan_id: otherFeatureId,
				name: "QA Usage Words",
				price: { amount: 25, interval: BillingInterval.Month },
				items: [prepaidItem({ featureId: TestFeature.Words, amount: 4 })],
			},
		],
	});

	logPlaybook({
		title:
			"Usage A and Usage B both charge Messages, so they share a feature-level Stripe product",
		steps: [
			`Usage prices resolve to the FEATURE's Stripe product, shared org-wide, not the plan's. A and B are not variants of each other.`,
			`Products > Rewards > create a coupon. "QA Usage A" and "QA Usage B" must appear as ONE grouped row, not two.`,
			`Ticking that row selects both plans' prices. Saving succeeds.`,
			`REGRESSION CHECK: if they render as two separate rows, selecting either alone is rejected by the server with "these plans share a Stripe product". That was the bug; it must not reappear.`,
			`"${otherFeatureId}" charges a different feature, so it stays its own row and can be selected alone.`,
			`Note: splitting a variant does NOT separate usage prices. They follow the feature, so this grouping is the only protection.`,
		],
	});
});
