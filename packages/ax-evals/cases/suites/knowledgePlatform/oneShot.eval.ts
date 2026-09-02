import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	creditsPackAddOnSpec,
	growthAnnualSpec,
	knowledgePlatformGoldenConfig,
	pooledConclusionChecks,
	proMonthlySpec,
} from "./knowledgePlatformPricing.ts";

/**
 * KIND A: the whole brief in one message, told to proceed. Grades all three
 * signature decisions at once — credit system + overage, packs as a separate
 * add-on (with the base-plan negative), monthly reset on annual plans, and
 * the config-invisible half of ①: deployment attach + org-wide pooling as
 * stated conclusions.
 */
export const oneShot = defineCase({
	name: "knowledge-platform-one-shot",
	prompt: [
		"hey, setting up billing for our docs platform. two paid plans, pro and growth —",
		"pro is $180/month or $1,800/year, growth is $500/month or $5,000/year.",
		"plans are bought per deployment — a customer can run several deployments, each on its own plan.",
		"pro comes with 5,000 AI credits a month, growth with 10,000 a month — annual plans still get them monthly, not all up front.",
		"credits are shared across the whole org though: every deployment's credits go into one pot any deployment can draw from.",
		"AI assistant messages use up credits, 1 per message.",
		"past the included credits it's $0.01 per credit, billed end of month.",
		"customers can also pay for extra credits on top: $100 a month gets 10,000 extra credits each month, $500 gets 55,000, $1,000 gets 120,000 — renews monthly, shared across deployments like the rest.",
		"no free plan, no trials.",
		"that's everything — go ahead, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	expect: [
		conduct.mustWriteImmediately(),
		...catalog({
			features: {
				"ai credits (credit system)": { type: "credit_system", granted: true },
			},
			exactPlans: false,
			plans: {
				"pro monthly 5000 credits": proMonthlySpec,
				"growth annual with monthly credit reset": growthAnnualSpec,
				"credit packs as separate prepaid add-on": creditsPackAddOnSpec,
			},
		}),
		config.noPrepaidOnBasePlans(),
		...judge.conversation(pooledConclusionChecks),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: knowledgePlatformGoldenConfig(),
});

initAxEval({ axCase: oneShot, maxTurns: 24, timeoutMs: 480_000 });
