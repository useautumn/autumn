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
 * TWIN of plans-then-credits: identical requirements delivered as ONE message.
 * The score delta between the pair measures whether iterative delivery itself
 * hurts the agent, independent of the pricing's difficulty.
 */
export const wholePricingOneShot = defineCase({
	name: "knowledge-platform-whole-pricing-one-shot",
	prompt: [
		"hey, setting up our billing. we've got two plans, pro and growth, and each can be paid monthly or yearly —",
		"pro is $150/month or $1,500/year, growth is $500/month or $5,000/year.",
		"every plan comes with 5,000 AI credits a month.",
		"plans apply per deployment btw — one customer can have a few deployments.",
		"customers can also buy credit packs on top of any plan, as an add-on:",
		"1,000 credits for $100, 2,000 for $200, 5,000 for $500, or 10,000 for $1,000 — a pack is a flat price, not per-credit.",
		"once a pack runs out, extra usage is $0.01 per credit, billed at the end of the month.",
		"that's everything — go ahead and set it up, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	expect: [
		...catalog({
			features: {
				"ai credits (metered)": { type: "metered", granted: true },
			},
			exactPlans: false,
			plans: {
				"pro monthly": proMonthlySpec,
				"growth annual": growthAnnualSpec,
				"credits add-on prepaid packages": creditsAddOnSpec,
				"overage priced somewhere": overageAnywhereSpec,
			},
		}),
		config.planCount(5),
		conduct.mustWriteImmediately(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
		conduct.noUnapprovedPush(),
	],
	goldenConfig: knowledgePlatformConfig(),
});

initAxEval({ axCase: wholePricingOneShot, maxTurns: 24, timeoutMs: 480_000 });
