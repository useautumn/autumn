import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	apiPro100kSpec,
	apiPro200kSpec,
	apiProSpec,
	campaignsPro25kSpec,
	campaignsPro100kSpec,
	messagingApiConfig,
} from "./messagingApiPricing.ts";

/**
 * KIND C (step-seed): the five plans exist; the user adds "tiers" to BOTH
 * lines — Pro email tiers and Campaigns contact tiers. The word "tiers" is
 * the trap: customers PICK a tier at checkout, so the right conclusion is
 * sibling plans via `.variant()` of each base, not `price.tiers` on the
 * items. The double ladder checks the rule generalizes across groups
 * instead of being applied to one plan and abandoned on the next. The
 * phrasing is deliberately ambiguous and the user is simulated: probing
 * resolves it, guessing usage-tiers does not. Graded wrongs: usage tiers on
 * a base plan, prepaid packs, standalone plan() copies (variant check), or
 * touching the base plans.
 */
export const seedTierVariants = defineCase({
	name: "messaging-api-seed-tier-variants",
	prompt: [
		"we've already got our plans in autumn.config.ts (API free/pro, Campaigns free/pro, SSO add-on).",
		"both pro plans actually come in higher tiers.",
		"API pro: the 100K tier is $45/month with 100,000 messages included, the 200K tier is $80/month with 200,000 —",
		"same $0.80 per 1,000 overage past the included amount on both tiers.",
		"Campaigns pro: the 25K tier is $150/month for up to 25,000 contacts, the 100K tier is $400/month for up to 100,000.",
	].join(" "),
	scenario: stepScenario(),
	simulatedUser: {
		goal: "Get the higher tiers of both Pro plans added to your existing Autumn catalog.",
		facts: [
			"- API Pro tiers: 100K at $45/month with 100,000 messages included, 200K at $80/month with 200,000. Both keep the $0.80 per 1,000 overage.",
			"- Campaigns Pro tiers: 25K at $150/month for up to 25,000 contacts, 100K at $400/month for up to 100,000. Contacts still don't reset.",
			"- If asked how customers get on a tier: they pick one on the pricing page and subscribe to it, like picking a plan. It's not automatic based on usage.",
			"- If asked whether a customer's price slides with usage within a month: no — they're on the tier they chose; API tiers just bill the overage rate past the included amount.",
			"- If asked about switching: customers upgrade or downgrade between tiers themselves. Nothing else changes between tiers — same features as the base pro plans.",
		].join("\n"),
	},
	existingFiles: { "autumn.config.ts": messagingApiConfig() },
	expect: [
		...catalog({
			exactPlans: false,
			plans: {
				"existing api pro untouched": apiProSpec,
				"api pro 100k sibling": apiPro100kSpec,
				"api pro 200k sibling": apiPro200kSpec,
				"campaigns pro 25k sibling": campaignsPro25kSpec,
				"campaigns pro 100k sibling": campaignsPro100kSpec,
			},
		}),
		config.planCount(9),
		config.definedAsVariants({ count: 4 }),
		config.noPrepaidOnBasePlans(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: messagingApiConfig({ withTierVariants: true }),
});

initAxEval({ axCase: seedTierVariants, maxTurns: 24, timeoutMs: 480_000 });
