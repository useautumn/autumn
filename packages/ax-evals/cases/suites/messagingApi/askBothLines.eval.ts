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
	messagingApiGoal,
	messagingApiUserFacts,
} from "./messagingApiPricing.ts";

/**
 * KIND B (manufactured twin): the "both lines held simultaneously" fact is
 * deleted. Four plans across two product lines is ambiguous — one lineup
 * where Campaigns Pro replaces API Pro, or two independent groups? Passing =
 * surfacing how the lines relate before deriving, then landing two groups.
 */
export const askBothLines = defineCase({
	name: "messaging-api-ask-both-lines",
	// oneShot's brief minus ONE fact: how the two lines relate.
	prompt: [
		"hey, setting up billing. we sell a sending API and also Campaigns (bulk sends to contact lists).",
		"API has a free plan with 3,000 messages a month and Pro at $25/month with 50,000.",
		"on API Pro, going over is $0.80 per 1,000 messages, billed end of month. the free plan just stops.",
		"Campaigns has its own free plan (up to 1,000 contacts) and Campaigns Pro at $40/month (up to 5,000). contacts don't reset.",
		"everyone starts on the free plans automatically. SSO add-on at $150/month flat. no trials.",
	].join(" "),
	scenario: stepScenario(),
	simulatedUser: {
		goal: messagingApiGoal,
		facts: messagingApiUserFacts,
	},
	expect: [
		...judge.conversation({
			"asked how the two product lines relate":
				"Did the agent ask the user how the API plans and the Campaigns plans relate — e.g. whether a customer can hold one of each at the same time, or whether they are one upgrade path?",
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

initAxEval({ axCase: askBothLines, maxTurns: 24, timeoutMs: 480_000 });
