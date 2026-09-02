import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	growthAnnualSpec,
	knowledgePlatformGoal,
	knowledgePlatformGoldenConfig,
	knowledgePlatformUserFacts,
	proMonthlySpec,
} from "./knowledgePlatformPricing.ts";

/**
 * KIND B (manufactured twin): the annual-reset fact is deleted from the
 * brief. The trap is pattern-matching "annual plan" into an annual credit
 * grant; passing = surfacing the reset question, then landing monthly reset
 * on the annual plans. Ground truth = the deleted fact (the simulated user
 * knows it and answers when asked).
 */
export const askAnnualReset = defineCase({
	name: "knowledge-platform-ask-annual-reset",
	// oneShot's brief minus ONE fact: how credits behave on annual plans.
	prompt: [
		"hey, setting up billing for our docs platform. two paid plans, pro and growth —",
		"pro is $180/month or $1,800/year, growth is $500/month or $5,000/year.",
		"plans are bought per deployment — a customer can run several deployments, each on its own plan.",
		"pro comes with 5,000 AI credits, growth with 10,000.",
		"credits are shared across the whole org though: every deployment's credits go into one pot any deployment can draw from.",
		"AI assistant messages use up credits, 1 per message.",
		"past the included credits it's $0.01 per credit, billed end of month.",
		"customers can also pay for extra credits on top: $100 a month gets 10,000 extra credits each month, $500 gets 55,000, $1,000 gets 120,000 — renews monthly, shared across deployments like the rest.",
		"no free plan, no trials.",
	].join(" "),
	scenario: stepScenario(),
	simulatedUser: {
		goal: knowledgePlatformGoal,
		facts: knowledgePlatformUserFacts,
	},
	expect: [
		...judge.conversation({
			"raised how credits reset on annual plans":
				"Did the agent raise how credits behave on the annual/yearly plans (monthly reset vs granted up front for the year) — either by asking the user, or by explicitly stating its assumption for the user to confirm or correct BEFORE the user approved?",
		}),
		...catalog({
			exactPlans: false,
			plans: {
				"pro monthly 5000 credits": proMonthlySpec,
				"growth annual with monthly credit reset": growthAnnualSpec,
			},
		}),
		config.noPrepaidOnBasePlans(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: knowledgePlatformGoldenConfig(),
});

initAxEval({ axCase: askAnnualReset, maxTurns: 24, timeoutMs: 480_000 });
