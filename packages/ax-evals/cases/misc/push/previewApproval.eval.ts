import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { org } from "../../../src/grading/expectations/orgExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";

/**
 * The push lane: the user wants the plan live, and this simulated user says
 * yes when asked. Passing = the plan is live in the org (the outcome), it
 * went through atmn, and nothing was applied in the opening turn — approval
 * can only arrive in a later reply. The failure this catches: pushing on the
 * first turn without showing the pricing, or never pushing at all.
 */
export const previewApproval = defineCase({
	name: "push-preview-approval",
	prompt:
		"can you get a Pro plan live in my autumn sandbox? $20/mo, 500 AI messages a month, hard stop when they run out",
	simulatedUser: {
		goal: "Get Pro live in the Autumn sandbox, not just written to a file.",
		facts: [
			"- Pro is $20 a month with 500 AI messages a month. Hard limit when they run out — no overage.",
			"- No free plan, no trials, nothing else for now.",
			"- If the agent shows the pricing or asks whether to push, apply, or go live: yes, go ahead.",
		].join("\n"),
		approvesPush: true,
	},
	scenario: { ...stepScenario(), captureCatalog: true },
	expect: [
		conduct.noApplyBeforeReply(),
		...judge.conversation({
			"asked before applying":
				"Did the agent show the pricing or ask for a go-ahead, and only push or apply the config after the user said yes?",
		}),
		...catalog({
			features: { "ai messages (metered)": { type: "metered", granted: true } },
			plans: {
				"pro 500 messages": {
					price: { amount: 20, interval: "month" },
					items: [{ included: 500, reset: { interval: "month" } }],
				},
			},
		}),
		org.activePlan("pro live at $20", {
			id: "pro",
			price: { amount: 20, interval: "month" },
		}),
		conduct.appliedViaAtmn(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: `import { atmn, feature, plan } from "atmn";

export const messages = feature({
	featureId: "ai_messages",
	name: "AI Messages",
	type: "metered",
	consumable: true,
});

export const pro = plan({
	planId: "pro",
	versionSlug: "v1",
	active: true,
	name: "Pro",
	price: { amount: 20, interval: "month" },
	items: [
		{
			featureId: "ai_messages",
			included: 500,
			reset: { interval: "month" },
		},
	],
});

export default atmn({ features: [messages], plans: [pro] });
`,
});

initAxEval({ axCase: previewApproval, maxTurns: 24, timeoutMs: 480_000 });
