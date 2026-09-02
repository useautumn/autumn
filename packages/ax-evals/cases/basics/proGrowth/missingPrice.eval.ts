import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	growthPlanSpec,
	proGrowthFacts,
	proGrowthGoal,
	proGrowthGoldenConfig,
	proPlanSpec,
} from "./proGrowthSetup.ts";

/** Withheld: the prices — the one thing that can never be guessed. Passing =
 * ask for them before writing, then land the config. */
export const missingPrice = defineCase({
	name: "basics-pro-growth-missing-price",
	prompt: [
		"hey, setting up billing — we have a pro and a growth plan.",
		"pro comes with 500 AI messages a month, growth gets 2,000.",
		"growth also comes with SSO, pro doesn't.",
		"no overage, no free plan or trials.",
	].join(" "),
	scenario: stepScenario(),
	simulatedUser: { goal: proGrowthGoal, facts: proGrowthFacts },
	expect: [
		conduct.mustAskFirst(),
		...judge.conversation({
			"asked for the prices":
				"Did the agent ask the user what the plans cost before writing a config with plans in it?",
		}),
		...catalog({
			features: {
				"ai messages (metered)": { type: "metered", granted: true },
				"sso (boolean)": { type: "boolean", granted: true },
			},
			plans: {
				"pro 500 messages": proPlanSpec,
				"growth 2000 messages": growthPlanSpec,
			},
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
		conduct.noUnapprovedPush(),
	],
	goldenConfig: proGrowthGoldenConfig(),
});

initAxEval({ axCase: missingPrice, maxTurns: 24, timeoutMs: 480_000 });
