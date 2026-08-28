import { defineCase } from "../../src/cases/defineCase.ts";
import { conduct } from "../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../src/grading/expectations/configExpectations.ts";
import { initAxEval } from "../../src/initAxEval.ts";
import { creditsGoldenConfig } from "../fixtures/creditsGolden.ts";

/**
 * VAGUE/must-ask: "10 AI credits" says nothing about the reset interval, and
 * monthly vs one-time produce materially different configs — the agent MUST
 * ask before writing. The simulated user answers from the fact card.
 */
export const vagueCredits = defineCase({
	name: "vague-credits",
	prompt:
		"We're launching a Pro plan for $20. It comes with 10 AI credits. Set up our autumn.config.ts.",
	answers: {
		month: "They should refresh every month.",
		interval: "They should refresh every month.",
		reset: "They should refresh every month.",
		"one-time": "No — they refresh every month.",
		"used up": "Yes, credits get used up as customers use AI features.",
		consum: "Yes, credits get used up as customers use AI features.",
		extra: "No extra charges — just the 10 included credits.",
		"per credit": "No extra charges — just the 10 included credits.",
		overage: "No extra charges — just the 10 included credits.",
	},
	expect: [
		conduct.mustAskFirst(),
		config.valid(),
		config.planCount(1),
		config.plan("pro with monthly credits", {
			price: { amount: 20, interval: "month" },
			items: [{ included: 10, reset: { interval: "month" } }],
		}),
		conduct.skillFired(),
		conduct.completed(),
	],
	goldenConfig: creditsGoldenConfig(),
});

initAxEval({ axCase: vagueCredits, maxTurns: 12, timeoutMs: 300_000 });
