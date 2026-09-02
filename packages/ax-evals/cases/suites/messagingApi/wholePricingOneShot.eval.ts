import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
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
 * ONE-SHOT: the whole messaging-API pricing pasted as a single brief, like a
 * founder dumping their pricing page. Hardest parts — "$0.80 per 1,000" must
 * become billing_units (not per-unit), channel caps must not reset, and the
 * three add-ons take three different shapes (flat / prepaid / graduated-to-inf).
 */
export const wholePricingOneShot = defineCase({
	name: "messaging-api-whole-pricing-one-shot",
	prompt: [
		"setting up billing for our messaging API. three plans:",
		"free, pro at $25/month, scale at $95/month.",
		"we bill on messages sent — free gets 3,000 a month, pro 50,000, scale 150,000.",
		"on the paid plans, going over costs $0.80 per 1,000 messages, billed at the end of the month. free just stops.",
		"plans also cap how many channels you can have — 2 on free, 10 on pro, 50 on scale. those are caps, they don't reset.",
		"then three add-ons: SSO is a flat $120/month.",
		"dedicated gateways are $40/month each — you pick how many you want and pay for them upfront.",
		"and workflows are pay-as-you-go: $2 per 1,000 runs up to 50k, $1.50 per 1,000 up to 250k, $1 per 1,000 after that.",
		"that's everything — go ahead, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	expect: [
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
		conduct.mustWriteImmediately(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
		conduct.noUnapprovedPush(),
	],
	goldenConfig: messagingApiConfig(),
});

initAxEval({ axCase: wholePricingOneShot, maxTurns: 24, timeoutMs: 480_000 });
