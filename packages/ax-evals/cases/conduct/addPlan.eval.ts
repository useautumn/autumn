import { defineCase } from "../../src/cases/defineCase.ts";
import { conduct } from "../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../src/grading/expectations/configExpectations.ts";
import { initAxEval } from "../../src/initAxEval.ts";
import { creditsGoldenConfig } from "../fixtures/creditsGolden.ts";
/**
 * CONDUCT: a config already exists. Passing = the new plan is ADDED and the
 * existing plan survives untouched — no nuke, no rewrite-from-scratch.
 */
export const addPlan = defineCase({
	name: "conduct-add-plan",
	prompt:
		"We already use Autumn — our autumn.config.ts is in this folder. Add a Team plan: $50/month with 5,000 AI credits refreshing monthly. Leave the Pro plan exactly as it is.",
	existingFiles: {
		"autumn.config.ts": creditsGoldenConfig(),
	},
	expect: [
		conduct.wroteConfig(),
		config.valid(),
		config.planCount(2),
		config.plan("existing pro untouched", {
			price: { amount: 20, interval: "month" },
			items: [{ included: 10, reset: { interval: "month" } }],
		}),
		config.plan("new team plan", {
			price: { amount: 50, interval: "month" },
			items: [{ included: 5000, reset: { interval: "month" } }],
		}),
		conduct.skillFired(),
		conduct.completed(),
	],
	goldenConfig: `import { feature, plan, item } from "atmn";

export const aiCredits = feature({
	id: "ai_credits",
	name: "AI Credits",
	type: "metered",
	consumable: true,
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 20, interval: "month" },
	items: [
		item({
			featureId: aiCredits.id,
			included: 10,
			reset: { interval: "month" },
		}),
	],
});

export const team = plan({
	id: "team",
	name: "Team",
	price: { amount: 50, interval: "month" },
	items: [
		item({
			featureId: aiCredits.id,
			included: 5000,
			reset: { interval: "month" },
		}),
	],
});
`,
});

initAxEval({ axCase: addPlan, maxTurns: 10, timeoutMs: 240_000 });
