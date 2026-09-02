import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	growthAnnualNoPoolSpec,
	knowledgePlatformGoldenConfig,
	proMonthlyNoPoolSpec,
} from "./knowledgePlatformPricing.ts";

/**
 * KIND B negative control (undeleted twin of askAnnualReset): the annual
 * reset behavior is stated up front, so asking about it again is a failure —
 * an agent that always asks passes the ask twin and fails this one.
 */
export const clearAnnualReset = defineCase({
	name: "knowledge-platform-clear-annual-reset",
	prompt: [
		"hey, setting up billing for our docs platform. two paid plans, pro and growth —",
		"pro is $180/month or $1,800/year, growth is $500/month or $5,000/year.",
		"pro comes with 5,000 AI credits a month, growth with 10,000 a month — annual plans still get them monthly, not all up front.",
		"AI assistant messages use up credits, 1 per message.",
		"past the included credits it's $0.01 per credit, billed end of month.",
		"no packs or anything else, no free plan, no trials.",
		"that's everything — go ahead, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	expect: [
		conduct.mustWriteImmediately(),
		...judge.conversation({
			"did not re-ask about annual credit reset":
				"Did the agent proceed WITHOUT asking the user again how credits reset on annual plans? Answer true if it never posed that question, false if it asked despite the user having already stated it.",
		}),
		...catalog({
			exactPlans: false,
			plans: {
				"pro monthly 5000 credits": proMonthlyNoPoolSpec,
				"growth annual with monthly credit reset": growthAnnualNoPoolSpec,
			},
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: knowledgePlatformGoldenConfig(),
});

initAxEval({ axCase: clearAnnualReset, maxTurns: 24, timeoutMs: 480_000 });
