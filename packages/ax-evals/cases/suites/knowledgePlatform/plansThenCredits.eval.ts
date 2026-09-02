import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { afterTurn } from "../../../src/grading/expectations/afterTurn.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	creditsAddOnSpec,
	growthAnnualSpec,
	knowledgePlatformConfig,
	overageAnywhereSpec,
	proMonthlySpec,
} from "./knowledgePlatformPricing.ts";

/**
 * MULTI-STEP: the user builds their pricing across two messages, the way real
 * setups happen — plans first, credit pricing after. Checkpoints (afterTurn)
 * localize failures; final-state expectations are the gate and catch turn 2
 * destroying turn 1's work. An LLM judge grades the conversation itself.
 */
export const plansThenCredits = defineCase({
	name: "knowledge-platform-plans-then-credits",
	prompt: [
		"hey, setting up our billing. we've got two plans, pro and growth, and each can be paid monthly or yearly —",
		"pro is $150/month or $1,500/year, growth is $500/month or $5,000/year.",
		"every plan comes with 5,000 AI credits a month.",
		"plans apply per deployment btw — one customer can have a few deployments.",
		"start with that, I'll explain how we sell extra credits after",
	].join(" "),
	followUpMessages: [
		[
			"ok so extra credits: customers can buy credit packs on top of any plan, as an add-on.",
			"1,000 credits for $100, 2,000 for $200, 5,000 for $500, or 10,000 for $1,000 — a pack is a flat price, not per-credit.",
			"once a pack runs out, extra usage is $0.01 per credit, billed at the end of the month.",
			"add that in",
		].join(" "),
	],
	scenario: stepScenario(),
	expect: [
		afterTurn(1, config.valid()),
		afterTurn(1, config.plan("pro monthly", proMonthlySpec)),
		afterTurn(1, config.plan("growth annual", growthAnnualSpec)),
		...catalog({
			features: {
				"ai credits (metered)": { type: "metered", granted: true },
			},
			// 5 plans total (monthly+annual pairs + add-on); the specs anchor one
			// of each shape, so exact-count comes from planCount instead.
			exactPlans: false,
			plans: {
				"pro monthly": proMonthlySpec,
				"growth annual": growthAnnualSpec,
				"credits add-on prepaid packages": creditsAddOnSpec,
				"overage priced somewhere": overageAnywhereSpec,
			},
		}),
		config.planCount(5),
		...judge.conversation({
			"showed pricing for approval":
				"Did the agent present the pricing back to the user (e.g. as a table or summary) at any point during the conversation?",
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
		conduct.noUnapprovedPush(),
	],
	goldenConfig: knowledgePlatformConfig(),
});

// maxTurns budgets assistant iterations per user message (observed: it resets
// each turn) — exploration-heavy kits need real headroom.
initAxEval({ axCase: plansThenCredits, maxTurns: 32, timeoutMs: 480_000 });
