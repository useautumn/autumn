import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	gracefulOverageExpectations,
	gracefulOverageGolden,
} from "./gracefulOverageSetup.ts";

/**
 * FILL / controls, graceful overage stated: NO overage price exists anywhere
 * (running out hard-stops by default), and enterprise must NOT hard-stop —
 * a 10% grace allowance, never auto-billed. Because no priced overage item
 * enables overage, the combination is overage_allowed (enable) +
 * spend_limits (cap). Traps: adding a PRICED overage item (auto-bills,
 * violating "never bill them for it"), or a spend limit alone (caps nothing
 * — overage was never enabled).
 */
export const gracefulOverage = defineCase({
	name: "fill-controls-graceful-overage",
	prompt: [
		"hey, two plans for our scraping API. everything runs on credits — 1 scrape is 1 credit.",
		"standard is $99/month with 100,000 credits a month. when they run out, they're done until next month.",
		"enterprise is $30,000/year with 5,000,000 credits a month — but enterprise customers should never get hard-stopped mid-job:",
		"let them run up to 10% over their monthly credits. we never auto-bill that overrun — we sort it out with them directly.",
		"that's everything — go ahead, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	expect: [
		conduct.mustWriteImmediately(),
		...gracefulOverageExpectations(),
		config.noPrepaidOnBasePlans(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
		conduct.noUnapprovedPush(),
	],
	goldenConfig: gracefulOverageGolden(),
});

initAxEval({ axCase: gracefulOverage, maxTurns: 24, timeoutMs: 480_000 });
