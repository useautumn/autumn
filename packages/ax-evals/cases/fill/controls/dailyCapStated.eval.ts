import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";

export const dailyCapStated = defineCase({
	name: "fill-controls-daily-cap-stated",
	prompt: [
		"hey, simple setup: one free plan everyone starts on, with 3,000 emails a month.",
		"but we don't want anyone burning it in a spike — max 200 emails a day, hard stop.",
		"that's everything — go ahead, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	expect: [
		conduct.mustWriteImmediately(),
		...catalog({
			features: {
				"emails (metered)": { type: "metered", granted: true },
			},
			plans: {
				"free with monthly 3000 allowance and a 200/day cap": {
					freePlan: true,
					auto_enable: true,
					items: [{ included: 3000, reset: { interval: "month" } }],
					billing_controls: {
						usage_limits: [{ limit: 200, interval: "day" }],
					},
				},
			},
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
		conduct.noUnapprovedPush(),
	],
	goldenConfig: `import { atmn, feature, plan } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "emails",
			name: "Emails",
			type: "metered",
			consumable: true,
		}),
	],
	plans: [
		plan({
			planId: "free",
			versionSlug: "v1",
			active: true,
			name: "Free",
			autoEnable: true,
			items: [
				{
					featureId: "emails",
					included: 3000,
					reset: { interval: "month" },
				},
			],
			billingControls: {
				usageLimits: [
					{ featureId: "emails", enabled: true, limit: 200, interval: "day" },
				],
			},
		}),
	],
});
`,
});

initAxEval({ axCase: dailyCapStated, maxTurns: 24, timeoutMs: 480_000 });
