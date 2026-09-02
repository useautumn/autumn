import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { afterTurn } from "../../../src/grading/expectations/afterTurn.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	freeSpec,
	gatewayAddOnSpec,
	messagingApiConfig,
	proSpec,
	scaleSpec,
	ssoAddOnSpec,
	workflowsAddOnSpec,
} from "./messagingApiPricing.ts";

/**
 * MULTI-STEP: base plans first, the three add-ons after — checkpoints prove
 * turn 1 landed, final state proves turn 2 added the three differently-shaped
 * add-ons (flat / prepaid / graduated) without destroying the base plans.
 */
export const plansThenAddOns = defineCase({
	name: "messaging-api-plans-then-add-ons",
	prompt: [
		"setting up billing for our messaging API. three plans:",
		"free, pro at $25/month, scale at $95/month.",
		"we bill on messages sent — free gets 3,000 a month, pro 50,000, scale 150,000.",
		"on the paid plans, going over costs $0.80 per 1,000 messages, billed at the end of the month. free just stops.",
		"plans also cap channels — 2 on free, 10 on pro, 50 on scale. caps don't reset.",
		"start with these, we sell some add-ons too — I'll explain after",
	].join(" "),
	followUpMessages: [
		[
			"ok the add-ons, all three optional on any paid plan:",
			"SSO is a flat $120/month.",
			"dedicated gateways are $40/month each — customers pick how many they want and pay for them upfront.",
			"workflows are pay-as-you-go: $2 per 1,000 runs up to 50k, $1.50 per 1,000 up to 250k, $1 per 1,000 after that.",
			"add those in",
		].join(" "),
	],
	scenario: stepScenario(),
	expect: [
		afterTurn(1, config.valid()),
		afterTurn(1, config.plan("free 3k messages", freeSpec)),
		afterTurn(1, config.plan("pro 50k + per-1k overage", proSpec)),
		...catalog({
			features: {
				"messages (metered)": { type: "metered", granted: true },
			},
			plans: {
				"free 3k messages": freeSpec,
				"pro 50k + per-1k overage": proSpec,
				"scale 150k messages": scaleSpec,
				"sso flat add-on": ssoAddOnSpec,
				"prepaid gateway add-on": gatewayAddOnSpec,
				"workflows graduated to inf": workflowsAddOnSpec,
			},
		}),
		...judge.conversation({
			"showed pricing for approval":
				"Did the agent present the pricing back to the user (e.g. as a table or summary) at any point during the conversation?",
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
		conduct.noUnapprovedPush(),
	],
	goldenConfig: messagingApiConfig(),
});

initAxEval({ axCase: plansThenAddOns, maxTurns: 32, timeoutMs: 480_000 });
