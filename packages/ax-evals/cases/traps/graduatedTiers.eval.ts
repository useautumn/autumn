import { defineCase } from "../../src/cases/defineCase.ts";
import { conduct } from "../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../src/grading/expectations/configExpectations.ts";
import { initAxEval } from "../../src/initAxEval.ts";
/**
 * TRAP: docs claim tier_behavior defaults to graduated; the schema requires
 * it whenever tiers are set. An agent trusting the doc omits it and produces
 * an invalid config. Passing = tiers modeled WITH tier_behavior stated.
 */
export const graduatedTiers = defineCase({
	name: "trap-graduated-tiers",
	prompt: [
		"Set up autumn.config.ts for our API product. One plan called Scale, no base fee.",
		"API calls are billed monthly on usage: the first 1,000 cost 1 cent each,",
		"the next 9,000 cost 0.8 cents each, and anything beyond that costs half a cent.",
	].join(" "),
	expect: [
		config.valid(),
		config.planCount(1),
		config.plan("scale with graduated tiers", {
			freePlan: true,
			items: [
				{
					price: {
						tier_behavior: "graduated",
						interval: "month",
						billing_method: "usage_based",
					},
				},
			],
		}),
		conduct.skillFired(),
		conduct.completed(),
	],
	goldenConfig: `import { feature, plan, item } from "atmn";

export const apiCalls = feature({
	id: "api_calls",
	name: "API Calls",
	type: "metered",
	consumable: true,
});

export const scale = plan({
	id: "scale",
	name: "Scale",
	items: [
		item({
			featureId: apiCalls.id,
			reset: { interval: "month" },
			price: {
				tiers: [
					{ to: 1000, amount: 0.01 },
					{ to: 10000, amount: 0.008 },
					{ to: "inf", amount: 0.005 },
				],
				tierBehavior: "graduated",
				interval: "month",
				billingMethod: "usage_based",
			},
		}),
	],
});
`,
});

initAxEval({ axCase: graduatedTiers, maxTurns: 10, timeoutMs: 240_000 });
