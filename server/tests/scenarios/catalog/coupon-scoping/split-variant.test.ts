import { test } from "bun:test";
import { BillingInterval, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { logPlaybook, resetCatalogPlans } from "../utils/catalogScenario.js";

const baseId = "qa-cpn-split-base";
const euId = "qa-cpn-split-eu";
const apacId = "qa-cpn-split-apac";

test(`${chalk.yellowBright("coupon-qa: split a variant onto its own Stripe product")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	const planIds = [baseId, euId, apacId];
	await resetCatalogPlans({ ctx, planIds });

	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: baseId,
				name: "QA Split Base",
				price: { amount: 30, interval: BillingInterval.Month },
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 200,
						reset: { interval: ResetInterval.Month },
					},
				],
				variants: [
					{ variant_plan_id: euId, name: "QA Split EU" },
					{ variant_plan_id: apacId, name: "QA Split APAC" },
				],
			},
		],
	});

	logPlaybook({
		title: "Base + EU + APAC all inherit the base Stripe product",
		steps: [
			`Developer > Stripe > Stripe product mappings. The base row reads "2 variants". Click it, then expand.`,
			`Each variant row offers "Create separate Stripe product". With 2 shared variants the group also offers "Split all variants".`,
			`Split EU only → toast, and the EU row flips to "Own Stripe product". APAC still inherits.`,
			`IMPORTANT: reopen Products > Rewards > create coupon. EU must now be its OWN row, separate from "Base + 1 plan". A stale cache bug lived exactly here.`,
			`Create a coupon on EU alone → it saves, and in Stripe its applies_to.products holds ONLY the new EU product.`,
			`In Stripe, the base product is untouched and any existing subscriptions still point at the original prices.`,
			`Split EU a second time → no-op, no second Stripe product is created.`,
			`Try the same action on the base plan → refused, it is not a variant.`,
		],
	});
});
