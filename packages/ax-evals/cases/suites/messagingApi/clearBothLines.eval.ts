import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	apiProSpec,
	campaignsProSpec,
	messagingApiConfig,
} from "./messagingApiPricing.ts";

/**
 * KIND B negative control (undeleted twin of askBothLines): independence of
 * the two lines is stated up front, so asking again is a failure — an agent
 * that always asks passes the ask twin and fails this one.
 */
export const clearBothLines = defineCase({
	name: "messaging-api-clear-both-lines",
	prompt: [
		"hey, setting up billing. two products: the sending API and Campaigns (bulk sends to contact lists) —",
		"customers can be on a plan for each at the same time, they're totally independent.",
		"API line: free with 3,000 messages a month, Pro at $25/month with 50,000, then $0.80 per 1,000 over, billed end of month. free just stops.",
		"Campaigns line: free holds up to 1,000 contacts, Campaigns Pro $40/month for up to 5,000. contacts don't reset.",
		"everyone starts on both free plans automatically. no add-ons, no trials.",
		"that's everything — go ahead, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	expect: [
		conduct.mustWriteImmediately(),
		...judge.conversation({
			"did not re-ask how the lines relate":
				"Did the agent proceed WITHOUT asking the user again whether the API and Campaigns plans can be held at the same time / how the two product lines relate? Answer true if it never posed that question, false if it asked despite the user having already stated it.",
		}),
		...catalog({
			exactPlans: false,
			plans: {
				"api pro with per-1k overage": apiProSpec,
				"campaigns pro 5000 contacts": campaignsProSpec,
			},
		}),
		config.planGroups({ count: 2 }),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: messagingApiConfig(),
});

initAxEval({ axCase: clearBothLines, maxTurns: 24, timeoutMs: 480_000 });
