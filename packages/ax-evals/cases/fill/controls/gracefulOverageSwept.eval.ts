import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	gracefulOverageExpectations,
	gracefulOverageGolden,
} from "./gracefulOverageSetup.ts";

/**
 * Swept twin of gracefulOverage: the brief never mentions what happens when
 * enterprise runs out — the guardrails sweep must raise it, and the user's
 * answer (10% grace, never auto-billed) must land as the same
 * overage_allowed + spend_limits combination. Catches never-asking (both
 * plans hard-stop) and asking-then-mismodeling (a priced overage item).
 */
export const gracefulOverageSwept = defineCase({
	name: "fill-controls-graceful-overage-swept",
	prompt: [
		"hey, two plans for our scraping API. everything runs on credits — 1 scrape is 1 credit.",
		"standard is $99/month with 100,000 credits a month.",
		"enterprise is $30,000/year with 5,000,000 credits a month.",
	].join(" "),
	scenario: stepScenario(),
	simulatedUser: {
		goal: "Get your scraping API's two plans set up in Autumn. Answer detail questions from your facts.",
		facts: [
			"- Standard is $99/month with 100,000 credits a month; enterprise is $30,000/year with 5,000,000 credits a month (credits still monthly).",
			"- If asked what happens when standard runs out: they're done until next month, hard stop.",
			"- If asked what happens when enterprise runs out: they should never get hard-stopped mid-job — let them run up to 10% over. Never auto-bill the overrun; we settle it with them directly.",
			"- If asked about buying extra credits / top-ups: no.",
			"- No other features, no trials, no free plan.",
		].join("\n"),
	},
	expect: [
		...judge.conversation({
			"asked about running out":
				"Did the agent ask the user what happens when a plan's credits run out (hard stop vs going over / caps or warnings)?",
		}),
		...gracefulOverageExpectations(),
		config.noPrepaidOnBasePlans(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
		conduct.noUnapprovedPush(),
	],
	goldenConfig: gracefulOverageGolden(),
});

initAxEval({ axCase: gracefulOverageSwept, maxTurns: 24, timeoutMs: 480_000 });
