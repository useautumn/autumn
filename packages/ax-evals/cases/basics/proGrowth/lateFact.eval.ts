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

export const lateFact = defineCase({
	name: "basics-pro-growth-late-fact",
	prompt: [
		"oh one thing I forgot — everyone should start on a free plan when they sign up:",
		"50 AI messages a month, no card needed. pro and growth stay exactly as they are.",
		"go ahead, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	existingFiles: { "autumn.config.ts": proGrowthGoldenConfig() },
	expect: [
		...catalog({
			plans: {
				"existing pro untouched": proPlanSpec,
				"existing growth untouched": growthPlanSpec,
				"free default tier 50 messages": {
					freePlan: true,
					auto_enable: true,
					items: [{ included: 50, reset: { interval: "month" } }],
				},
			},
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: proGrowthGoldenConfig({ withFree: true }),
});

initAxEval({ axCase: lateFact, maxTurns: 24, timeoutMs: 480_000 });
