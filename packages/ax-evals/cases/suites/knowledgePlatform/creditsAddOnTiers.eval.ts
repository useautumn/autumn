import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	creditsAddOnSpec,
	growthAnnualSpec,
	knowledgePlatformConfig,
	overageAnywhereSpec,
	proMonthlySpec,
} from "./knowledgePlatformPricing.ts";

/**
 * FOCUSED: base plans already exist; the ask is just the credits add-on.
 * Hardest parts — prepaid packages must become volume tiers with flat
 * amounts (not per-credit pricing), overage placement is the agent's choice,
 * and the four existing plans must survive.
 */
export const creditsAddOnTiers = defineCase({
	name: "knowledge-platform-credits-add-on-tiers",
	prompt: [
		"we've already got our base plans set up in here.",
		"now add how we sell extra credits: customers can buy credit packs on top of any plan, as an add-on.",
		"1,000 credits for $100, 2,000 for $200, 5,000 for $500, or 10,000 for $1,000 — a pack is a flat price, not per-credit.",
		"once a pack runs out, extra usage is $0.01 per credit, billed at the end of the month.",
		"that's everything — go ahead, no need to ask me anything",
	].join(" "),
	existingFiles: {
		"autumn.config.ts": knowledgePlatformConfig({ withCreditsAddOn: false }),
	},
	scenario: stepScenario(),
	expect: [
		...catalog({
			features: {
				"ai credits (metered)": { type: "metered", granted: true },
			},
			exactPlans: false,
			plans: {
				"existing pro untouched": proMonthlySpec,
				"existing growth annual untouched": growthAnnualSpec,
				"credits add-on prepaid packages": creditsAddOnSpec,
				"overage priced somewhere": overageAnywhereSpec,
			},
		}),
		config.planCount(5),
		conduct.wroteConfig(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
		conduct.noUnapprovedPush(),
	],
	goldenConfig: knowledgePlatformConfig(),
});

initAxEval({ axCase: creditsAddOnTiers, maxTurns: 24, timeoutMs: 480_000 });
