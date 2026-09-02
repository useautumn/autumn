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

/** Withheld: the features (messages + SSO). Prices are given. Passing = ask
 * what the plans include before writing, then land the config. */
export const missingFeatures = defineCase({
	name: "basics-pro-growth-missing-features",
	prompt:
		"hey, billing setup: we have a pro plan at $20 a month and a growth plan at $50 a month",
	scenario: stepScenario(),
	simulatedUser: { goal: proGrowthGoal, facts: proGrowthFacts },
	expect: [
		...judge.conversation({
			"asked before writing":
				"Did the agent ask the user at least one clarifying question before first writing a config with plans in it?",
			"asked about usage limits":
				"Did the agent ask the user about usage limits or metered features (e.g. message allowances)?",
			"asked about on/off features":
				"Did the agent ask the user about boolean / on-off features (e.g. SSO or feature access differences between plans)?",
			"showed pricing for approval":
				"Did the agent present the pricing back to the user (e.g. as a table or summary) and ask for confirmation before finishing?",
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
	],
	goldenConfig: proGrowthGoldenConfig(),
});

initAxEval({ axCase: missingFeatures, maxTurns: 24, timeoutMs: 480_000 });
