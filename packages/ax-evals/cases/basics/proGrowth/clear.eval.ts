import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	growthPlanSpec,
	proGrowthGoldenConfig,
	proPlanSpec,
} from "./proGrowthSetup.ts";

/** Everything stated up front, told to proceed. The twin that keeps the
 * missing-X cases honest — an agent that always asks passes those and fails
 * this. */
export const clear = defineCase({
	name: "basics-pro-growth-clear",
	prompt: [
		"hey, billing setup: pro is $20 a month, growth is $50 a month. monthly only for now.",
		"we want to limit AI messages — pro gets 500 a month, growth gets 2,000 a month.",
		"growth also comes with SSO, pro doesn't.",
		"no overage — hard limit when they run out. no free plan or trials for now.",
		"that's everything — go ahead, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	expect: [
		conduct.mustWriteImmediately(),
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

initAxEval({ axCase: clear, maxTurns: 24, timeoutMs: 480_000 });
