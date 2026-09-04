import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	growthAnnualSpec,
	knowledgePlatformGoal,
	knowledgePlatformGoldenConfig,
	knowledgePlatformUserFacts,
	proMonthlySpec,
} from "./knowledgePlatformPricing.ts";

/**
 * KIND B (manufactured twin): the org-wide pooling fact is deleted, but the
 * per-deployment attach fact stays — so the skill's "who uses each metered
 * feature: one shared balance or separate ones?" fork is live and must be
 * asked. Ground truth = the deleted fact (shared org-wide pot).
 */
export const askPooledBalances = defineCase({
	name: "knowledge-platform-ask-pooled-balances",
	prompt: [
		"hey, setting up billing for our docs platform. two paid plans, pro and growth —",
		"pro is $180/month or $1,800/year, growth is $500/month or $5,000/year.",
		"plans are bought per deployment — a customer can run several deployments, each on its own plan.",
		"pro comes with 5,000 AI credits a month, growth with 10,000 a month — annual plans still get them monthly.",
		"AI assistant messages use up credits, 1 per message.",
		"past the included credits it's $0.01 per credit, billed end of month.",
	].join(" "),
	scenario: stepScenario(),
	simulatedUser: {
		goal: knowledgePlatformGoal,
		facts: knowledgePlatformUserFacts,
	},
	expect: [
		...judge.conversation({
			"asked whether credits are shared or per-deployment":
				"Did the agent ask the user whether each deployment keeps its own separate credit balance or the credits are shared/pooled across deployments?",
			"concluded credits pool org-wide":
				"Did the agent's final structure/summary state that included credits are shared/pooled across all deployments into one org-wide balance, rather than each deployment keeping its own?",
		}),
		...catalog({
			exactPlans: false,
			plans: {
				"pro monthly 5000 credits": proMonthlySpec,
				"growth annual with monthly credit reset": growthAnnualSpec,
			},
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: knowledgePlatformGoldenConfig(),
});

initAxEval({ axCase: askPooledBalances, maxTurns: 24, timeoutMs: 480_000 });
