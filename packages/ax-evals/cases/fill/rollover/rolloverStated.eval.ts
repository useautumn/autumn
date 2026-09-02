import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";

/**
 * FILL / rollover, terms stated: the structure is trivial and every rollover
 * term is in the brief — 50% cap, expires after 2 months. Passing = the item
 * carries the exact rollover config (max_percentage, not max; month expiry
 * with length 2). Grading is fully deterministic on the wire shape.
 */
export const rolloverStated = defineCase({
	name: "fill-rollover-stated",
	prompt: [
		"hey, one plan: pro at $30 a month with 1,000 credits a month.",
		"unused credits carry over, but only up to half their monthly amount,",
		"and anything carried over expires after 2 months.",
		"chat messages draw from credits, 1 credit each.",
		"that's everything — go ahead, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	expect: [
		conduct.mustWriteImmediately(),
		...catalog({
			features: {
				"credits (credit system)": { type: "credit_system", granted: true },
			},
			plans: {
				"pro with 50% rollover expiring in 2 months": {
					price: { amount: 30, interval: "month" },
					items: [
						{
							included: 1000,
							reset: { interval: "month" },
							rollover: {
								max_percentage: 50,
								expiry_duration_type: "month",
								expiry_duration_length: 2,
							},
						},
					],
				},
			},
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: `import { feature, plan, item } from "atmn";

export const messages = feature({
	id: "messages",
	name: "Chat Messages",
	type: "metered",
	consumable: true,
});

export const credits = feature({
	id: "credits",
	name: "Credits",
	type: "credit_system",
	creditSchema: [{ meteredFeatureId: "messages", creditCost: 1 }],
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 30, interval: "month" },
	items: [
		item({
			featureId: credits.id,
			included: 1000,
			reset: { interval: "month" },
			rollover: {
				maxPercentage: 50,
				expiryDurationType: "month",
				expiryDurationLength: 2,
			},
		}),
	],
});
`,
});

initAxEval({ axCase: rolloverStated, maxTurns: 24, timeoutMs: 480_000 });
