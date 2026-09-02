import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";

/**
 * FILL / add-on shape, stated twin: the flat nature is explicit ("one flat
 * fee, unlocks the feature"), so probing per-unit-vs-flat again is a
 * failure. The flat shape = base price on the add-on plan granting a boolean
 * feature — NOT a per-unit prepaid item.
 */
export const addOnFlatStated = defineCase({
	name: "fill-add-on-flat-stated",
	prompt: [
		"hey, simple setup: one pro plan at $30 a month with 1,000 AI messages a month.",
		"there's also an SSO add-on — one flat $50 a month, just unlocks SSO for the account, nothing per-seat or per-anything.",
		"that's everything — go ahead, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	expect: [
		conduct.mustWriteImmediately(),
		...judge.conversation({
			"did not re-ask per-unit or flat":
				"Did the agent proceed WITHOUT asking whether the SSO add-on is priced per unit or flat? Answer true if it never posed that question, false if it asked despite the user having said it's one flat fee.",
		}),
		...catalog({
			features: {
				"sso (boolean)": { type: "boolean", granted: true },
			},
			exactPlans: false,
			plans: {
				"pro 1000 messages": {
					price: { amount: 30, interval: "month" },
					items: [{ included: 1000, reset: { interval: "month" } }],
				},
				"sso add-on with flat base price": {
					add_on: true,
					price: { amount: 50, interval: "month" },
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

export const sso = feature({
	id: "sso",
	name: "SSO",
	type: "boolean",
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

export const ssoAddOn = plan({
	id: "sso_add_on",
	name: "SSO",
	addOn: true,
	price: { amount: 50, interval: "month" },
	items: [item({ featureId: sso.id })],
});
`,
});

initAxEval({ axCase: addOnFlatStated, maxTurns: 24, timeoutMs: 480_000 });
