import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";

/**
 * FILL / rollover, unstated: the brief never mentions carry-over — the
 * agent's option sweep must raise it, and the user's answer (cap at the
 * monthly amount, expire after 1 month) must land as exact config. Catches
 * both failure modes: never asking (no rollover configured) and configuring
 * without the details (wrong cap/expiry).
 */
export const rolloverSwept = defineCase({
	name: "fill-rollover-swept",
	prompt:
		"hey, simple setup: one pro plan, $30 a month, comes with 1,000 credits a month. chat messages use credits, 1 each.",
	scenario: stepScenario(),
	simulatedUser: {
		goal: "Get your Pro plan set up in Autumn. You gave the basics up front; answer detail questions from your facts.",
		facts: [
			"- Pro is $30 a month with 1,000 credits a month; chat messages cost 1 credit each.",
			"- If asked about unused credits carrying over: yes — they carry over, capped at one month's worth (1,000), and carried-over credits expire after 1 month.",
			"- If asked about running out: hard stop, no overage.",
			"- If asked about buying more / top-ups: no.",
			"- No other features, no trials, no free plan.",
		].join("\n"),
	},
	expect: [
		...judge.conversation({
			"raised carry-over":
				"Did the agent raise the topic of unused credits carrying over / rolling over — either by asking, or by stating its assumption about it for the user to confirm or correct?",
		}),
		...catalog({
			features: {
				"credits (credit system)": { type: "credit_system", granted: true },
			},
			plans: {
				"pro with rollover capped at 1000 expiring in 1 month": {
					price: { amount: 30, interval: "month" },
					items: [
						{
							included: 1000,
							reset: { interval: "month" },
							rollover: {
								max: 1000,
								expiry_duration_type: "month",
								expiry_duration_length: 1,
							},
						},
					],
				},
			},
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: `import { feature, plan, item } from "atmn";

export const messages = feature({
	id: "messages",
	name: "Chat Messages",
	type: "metered",
	consumable: true,
});

export const credits = feature({
	id: "credits",
	name: "Credits",
	type: "credit_system",
	creditSchema: [{ meteredFeatureId: "messages", creditCost: 1 }],
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 30, interval: "month" },
	items: [
		item({
			featureId: credits.id,
			included: 1000,
			reset: { interval: "month" },
			rollover: {
				max: 1000,
				expiryDurationType: "month",
				expiryDurationLength: 1,
			},
		}),
	],
});
`,
});

initAxEval({ axCase: rolloverSwept, maxTurns: 24, timeoutMs: 480_000 });
