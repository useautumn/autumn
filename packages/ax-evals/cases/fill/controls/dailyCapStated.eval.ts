import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";

/**
 * FILL / controls, daily cap stated: a windowed cap alongside a monthly
 * allowance ("3,000 a month but never more than 200 a day"). Passing = a
 * `usage_limits` entry on the plan's billing controls — NOT a second item,
 * a smaller allowance, or a daily reset on the monthly item. The allowance
 * item must stay monthly/3,000 (its verdict is the negative anchor).
 */
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
	goldenConfig: `import { billingControls, feature, plan, item } from "atmn";

export const emails = feature({
	id: "emails",
	name: "Emails",
	type: "metered",
	consumable: true,
});

export const free = plan({
	id: "free",
	name: "Free",
	autoEnable: true,
	items: [
		item({
			featureId: emails.id,
			included: 3000,
			reset: { interval: "month" },
		}),
	],
	billingControls: billingControls({
		usage_limits: [
			{ feature_id: "emails", enabled: true, limit: 200, interval: "day" },
		],
	}),
});
`,
});

initAxEval({ axCase: dailyCapStated, maxTurns: 24, timeoutMs: 480_000 });
