import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	apiFreeSpec,
	apiProSpec,
	campaignsProSpec,
	messagingApiConfig,
	ssoAddOnSpec,
} from "./messagingApiPricing.ts";

/**
 * KIND A: the whole brief in one message. Grades the two-lines→groups
 * decision (①), the per-1k overage (③), lifetime caps, free defaults per
 * group, and the flat SSO add-on in one structure.
 */
export const oneShot = defineCase({
	name: "messaging-api-one-shot",
	prompt: [
		"hey, setting up billing. we've got two products: the sending API, and Campaigns (bulk sends to contact lists) —",
		"customers can be on a plan for each at the same time, they're independent.",
		"API line: free gets 3,000 messages a month, Pro is $25/month with 50,000 —",
		"past that it's $0.80 per 1,000 messages, billed end of month. free just stops.",
		"Campaigns line: free holds up to 1,000 contacts, Campaigns Pro is $40/month for up to 5,000. contacts don't reset, it's just how many you can store.",
		"everyone starts on both free plans automatically.",
		"SSO is a paid add-on, $150 a month flat.",
		"no trials. that's everything — go ahead, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	expect: [
		conduct.mustWriteImmediately(),
		...catalog({
			features: {
				"messages (metered)": { type: "metered", granted: true },
			},
			exactPlans: false,
			plans: {
				"api free 3000 messages": apiFreeSpec,
				"api pro with per-1k overage": apiProSpec,
				"campaigns pro 5000 contacts": campaignsProSpec,
				"sso flat add-on": ssoAddOnSpec,
			},
		}),
		config.planCount(5),
		config.planGroups({ count: 2 }),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: messagingApiConfig(),
});

initAxEval({ axCase: oneShot, maxTurns: 24, timeoutMs: 480_000 });
