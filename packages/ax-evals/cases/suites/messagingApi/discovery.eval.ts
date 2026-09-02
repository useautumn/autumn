import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	freeSpec,
	messagingApiConfig,
	proSpec,
	scaleSpec,
} from "./messagingApiPricing.ts";

/**
 * DISCOVERY: vague opener, everything withheld — the agent must interview
 * (prices, what's metered, overage) and land the three base plans. A
 * tau-style LLM user answers from the brief and deflects add-ons; an LLM
 * judge grades interview coverage; config grading stays deterministic.
 */
export const discovery = defineCase({
	name: "messaging-api-discovery",
	prompt:
		"hey, we run a messaging API for developers and want to set up our billing",
	scenario: stepScenario(),
	simulatedUser: {
		goal: "Get your messaging API's three base plans (Free, Pro, Scale) set up in Autumn, without touching a dashboard.",
		facts: [
			"- There's a free plan, then Pro at $25 a month and Scale at $95 a month. Monthly billing only.",
			"- You bill on messages sent: Free gets 3,000 a month, Pro 50,000, Scale 150,000.",
			"- On the paid plans, going over costs $0.80 per 1,000 messages, billed at the end of the month. The free plan just stops.",
			"- Channels are capped per plan: 2 on Free, 10 on Pro, 50 on Scale. Those are caps, they don't reset.",
			"- No trials.",
			"- You also sell add-ons (SSO, dedicated gateways, workflows) but you want to leave those out for now — just the three base plans.",
		].join("\n"),
	},
	expect: [
		...judge.conversation({
			"asked before writing":
				"Did the agent ask the user at least one clarifying question before first writing autumn.config.ts?",
			"asked about prices":
				"Did the agent ask the user what the plans cost or how they're priced?",
			"asked about usage limits":
				"Did the agent ask the user about usage limits or metered features (e.g. message allowances)?",
			"asked about overage":
				"Did the agent ask the user what happens when a customer exceeds their included usage (overage)?",
			"showed pricing for approval":
				"Did the agent present the pricing back to the user (e.g. as a table or summary) and ask for confirmation before finishing?",
		}),
		...catalog({
			features: {
				"messages (metered)": { type: "metered", granted: true },
			},
			plans: {
				"free 3k messages": freeSpec,
				"pro 50k + per-1k overage": proSpec,
				"scale 150k messages": scaleSpec,
			},
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
		conduct.noUnapprovedPush(),
	],
	goldenConfig: messagingApiConfig({ withAddOns: false }),
});

initAxEval({ axCase: discovery, maxTurns: 24, timeoutMs: 480_000 });
