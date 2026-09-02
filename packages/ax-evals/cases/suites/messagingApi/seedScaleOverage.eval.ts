import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import { messagingApiConfig } from "./messagingApiPricing.ts";

/**
 * KIND C (step-seed): Scale "tiers" where the OVERAGE RATE improves per tier
 * — the forced-plans tripwire. One prepaid volume item structurally cannot
 * hold per-tier overage rates, so each tier must be its own plan. Graded on
 * each tier carrying its own overage amount; standalone plan() vs .variant()
 * is not enforced here (the line is new, so no base pre-exists — the variant
 * style assertion lives in seedTierVariants).
 */
export const seedScaleOverage = defineCase({
	name: "messaging-api-seed-scale-overage",
	prompt: [
		"we've already got our plans in autumn.config.ts (API free/pro, Campaigns free/pro, SSO add-on).",
		"we're adding a Scale line on the API side for the big senders — it comes in volume tiers:",
		"the 500K tier is $350/month with 500,000 messages included, then $0.70 per 1,000 over.",
		"the 1M tier is $650/month with 1,000,000 included, then $0.65 per 1,000 over.",
		"the 2M tier is $1,150/month with 2,000,000 included, then $0.55 per 1,000 over.",
		"the bigger the tier, the better the overage rate they lock in.",
		"go ahead and add those, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	existingFiles: { "autumn.config.ts": messagingApiConfig() },
	expect: [
		...catalog({
			exactPlans: false,
			plans: {
				"scale 500k with $0.70 per 1k overage": {
					price: { amount: 350, interval: "month" },
					items: [
						{ included: 500000, price: { amount: 0.7, billing_units: 1000 } },
					],
				},
				"scale 1m with $0.65 per 1k overage": {
					price: { amount: 650, interval: "month" },
					items: [
						{ included: 1000000, price: { amount: 0.65, billing_units: 1000 } },
					],
				},
				"scale 2m with $0.55 per 1k overage": {
					price: { amount: 1150, interval: "month" },
					items: [
						{ included: 2000000, price: { amount: 0.55, billing_units: 1000 } },
					],
				},
			},
		}),
		config.planCount(8),
		config.noPrepaidOnBasePlans(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: `${messagingApiConfig()}
export const apiScale = plan({
	id: "api_scale",
	name: "API Scale 500K",
	group: "api",
	price: { amount: 350, interval: "month" },
	items: [
		item({
			featureId: messages.id,
			included: 500000,
			reset: { interval: "month" },
			price: {
				amount: 0.7,
				billingUnits: 1000,
				billingMethod: "usage_based",
				interval: "month",
			},
		}),
	],
});

export const apiScale1m = apiScale.variant({
	id: "api_scale_1m",
	name: "API Scale 1M",
	customize: {
		price: { amount: 650, interval: "month" },
		addItems: [
			item({
				featureId: messages.id,
				included: 1000000,
				reset: { interval: "month" },
				price: {
					amount: 0.65,
					billingUnits: 1000,
					billingMethod: "usage_based",
					interval: "month",
				},
			}),
		],
		removeItems: [{ featureId: messages.id }],
	},
});

export const apiScale2m = apiScale.variant({
	id: "api_scale_2m",
	name: "API Scale 2M",
	customize: {
		price: { amount: 1150, interval: "month" },
		addItems: [
			item({
				featureId: messages.id,
				included: 2000000,
				reset: { interval: "month" },
				price: {
					amount: 0.55,
					billingUnits: 1000,
					billingMethod: "usage_based",
					interval: "month",
				},
			}),
		],
		removeItems: [{ featureId: messages.id }],
	},
});
`,
});

initAxEval({ axCase: seedScaleOverage, maxTurns: 24, timeoutMs: 480_000 });
