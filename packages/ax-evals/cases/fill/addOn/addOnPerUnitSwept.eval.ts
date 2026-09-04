import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";

/**
 * FILL / add-on shape, unstated: "a domains add-on for $10" is ambiguous —
 * $10 per domain (prepaid per-unit item) or $10 flat for the capability
 * (base price on the add-on plan)? The agent must probe; the user's answer
 * (per domain, buy as many as needed) must land as a prepaid per-unit item,
 * not a flat base price.
 */
export const addOnPerUnitSwept = defineCase({
	name: "fill-add-on-per-unit-swept",
	prompt: [
		"hey, simple setup: one pro plan at $30 a month, comes with 5 domains included.",
		"customers can also get extra domains as an add-on for $10 a month.",
	].join(" "),
	scenario: stepScenario(),
	simulatedUser: {
		goal: "Get your Pro plan and the domains add-on set up in Autumn. Answer detail questions from your facts.",
		facts: [
			"- Pro is $30 a month and includes 5 domains. Domains don't reset — it's how many you can have connected.",
			"- If asked whether the $10 add-on is per domain or a flat fee: it's $10 per extra domain, per month — customers pick how many they want and can buy as many as they need.",
			"- If asked about limits on extra domains: no cap.",
			"- No other features, no trials, no free plan.",
		].join("\n"),
	},
	expect: [
		...judge.conversation({
			"asked per-unit or flat":
				"Did the agent ask the user whether the $10 domains add-on is priced per domain (per unit) or as a flat fee?",
		}),
		...catalog({
			exactPlans: false,
			plans: {
				"pro with 5 domains": {
					price: { amount: 30, interval: "month" },
					items: [{ included: 5 }],
				},
				"domains add-on priced per unit prepaid": {
					add_on: true,
					items: [
						{
							price: {
								amount: 10,
								billing_method: "prepaid",
								interval: "month",
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

export const domains = feature({
	id: "domains",
	name: "Domains",
	type: "metered",
	consumable: false,
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 30, interval: "month" },
	items: [item({ featureId: domains.id, included: 5 })],
});

export const extraDomains = plan({
	id: "extra_domains",
	name: "Extra Domains",
	addOn: true,
	items: [
		item({
			featureId: domains.id,
			included: 0,
			price: {
				amount: 10,
				billingUnits: 1,
				billingMethod: "prepaid",
				interval: "month",
			},
		}),
	],
});
`,
});

initAxEval({ axCase: addOnPerUnitSwept, maxTurns: 24, timeoutMs: 480_000 });
