import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	creditsPackAddOnSpec,
	growthAnnualSpec,
	knowledgePlatformGoldenConfig,
	proMonthlySpec,
} from "./knowledgePlatformPricing.ts";

/**
 * KIND C (step-seed): the four base plans already exist in the workspace; the
 * user adds packs with the tempting "on any plan" phrasing. The right
 * conclusion is ONE separate attach-on-top add-on plan; the graded wrongs are
 * a prepaid item duplicated onto every base plan (negative anchor), a
 * replacement plan without addOn, or nuking the existing base plans.
 */
export const seedPacksFork = defineCase({
	name: "knowledge-platform-seed-packs-fork",
	prompt: [
		"we've already got our four plans set up in autumn.config.ts (pro and growth, monthly and annual, with their AI credits).",
		"one more thing: customers on any plan should be able to pay for extra credits —",
		"$100 a month gets 10,000 extra credits each month, $500 gets 55,000, $1,000 gets 120,000.",
		"go ahead and add that, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	existingFiles: {
		"autumn.config.ts": knowledgePlatformGoldenConfig({ withPacks: false }),
	},
	expect: [
		...catalog({
			exactPlans: false,
			plans: {
				"existing pro untouched": proMonthlySpec,
				"existing growth annual untouched": growthAnnualSpec,
				"credit packs as separate prepaid add-on": creditsPackAddOnSpec,
			},
		}),
		config.noPrepaidOnBasePlans(),
		...judge.conversation({
			"presented packs as a separate purchase on top":
				"When showing the result, did the agent describe the credit packs as a separate add-on purchased on top of a customer's existing plan (rather than as part of each base plan)?",
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: knowledgePlatformGoldenConfig(),
});

initAxEval({ axCase: seedPacksFork, maxTurns: 24, timeoutMs: 480_000 });
