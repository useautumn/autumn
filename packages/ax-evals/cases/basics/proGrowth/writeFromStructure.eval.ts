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

/**
 * KIND E (fill/write isolate): the structure arrives already agreed, phrased
 * as the skill's own restate block. Nothing to derive or elicit — passing is
 * purely translating an agreed structure into a valid config with every
 * number in the right field.
 */
export const writeFromStructure = defineCase({
	name: "basics-pro-growth-write-from-structure",
	prompt: [
		"here's where we got to with our billing structure, all agreed:",
		"plans: Pro at $20/month, Growth at $50/month, monthly billing only.",
		"features: AI messages (metered) — Pro includes 500/month, Growth 2,000/month, hard limit, resets monthly;",
		"SSO (on/off) — on Growth only.",
		"no free plan, no trials, no overage. write it up.",
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

initAxEval({ axCase: writeFromStructure, maxTurns: 24, timeoutMs: 480_000 });
