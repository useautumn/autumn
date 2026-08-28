import { defineCase } from "../../src/cases/defineCase.ts";
import { conduct } from "../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../src/grading/expectations/configExpectations.ts";
import { initAxEval } from "../../src/initAxEval.ts";
import { creditsGoldenConfig } from "../fixtures/creditsGolden.ts";

/**
 * TWIN of vague-credits: same pricing, fully specified — must write
 * immediately, no clarifying questions. Twins keep the suite from training
 * chronic over-asking.
 */
export const clearCredits = defineCase({
	name: "clear-credits",
	prompt:
		"We're launching a Pro plan for $20/month. It includes 10 AI credits that refresh monthly and get used up as customers use AI features. No overage charges. Everything is decided — write our autumn.config.ts now.",
	expect: [
		conduct.mustWriteImmediately(),
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

initAxEval({ axCase: clearCredits, maxTurns: 10, timeoutMs: 240_000 });
