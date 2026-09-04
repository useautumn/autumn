import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";

/**
 * The default-trial flow on the simplest catalog: everyone starts on a
 * no-card trial of Pro automatically. The optimal modeling is a SEPARATE
 * default plan — free base price, auto-enabled, carrying the no-card trial
 * with Pro's entitlements — next to the untouched paid Pro plan. The graded
 * wrong is hanging the trial off the paid plan itself.
 */
export const defaultTrial = defineCase({
	name: "basics-default-trial",
	prompt: [
		"hey, simple setup: one pro plan at $30 a month with 1,000 AI messages a month.",
		"everyone who signs up starts on a free 14-day trial of pro automatically — no card up front.",
		"when the trial ends they have to subscribe to keep going.",
		"that's everything — go ahead, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	expect: [
		conduct.mustWriteImmediately(),
		...catalog({
			features: {
				"ai messages (metered)": { type: "metered", granted: true },
			},
			plans: {
				"pro paid plan without the trial": {
					price: { amount: 30, interval: "month" },
					items: [{ included: 1000, reset: { interval: "month" } }],
				},
				"separate free default plan carrying the no-card trial": {
					freePlan: true,
					auto_enable: true,
					free_trial: {
						duration_type: "day",
						duration_length: 14,
						card_required: false,
					},
					items: [{ included: 1000 }],
				},
			},
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: `import { feature, plan, item } from "atmn";

export const aiMessages = feature({
	id: "ai_messages",
	name: "AI Messages",
	type: "metered",
	consumable: true,
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 30, interval: "month" },
	items: [
		item({
			featureId: aiMessages.id,
			included: 1000,
			reset: { interval: "month" },
		}),
	],
});

export const proTrial = plan({
	id: "pro_trial",
	name: "Pro Trial",
	autoEnable: true,
	freeTrial: {
		durationType: "day",
		durationLength: 14,
		cardRequired: false,
	},
	items: [
		item({
			featureId: aiMessages.id,
			included: 1000,
			reset: { interval: "month" },
		}),
	],
});
`,
});

initAxEval({ axCase: defaultTrial, maxTurns: 24, timeoutMs: 480_000 });
