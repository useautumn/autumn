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
	pooledConclusionChecks,
	proMonthlySpec,
} from "./knowledgePlatformPricing.ts";

/**
 * KIND B (manufactured twin): the per-deployment attach fact is deleted from
 * the brief. "Docs platform" + deployments-shaped pricing must make the agent
 * pin down what a plan attaches to — the skill calls this the question that
 * "changes everything downstream". Ground truth = the deleted fact; the
 * simulated user knows it and answers when asked.
 */
export const askDeploymentAttach = defineCase({
	name: "knowledge-platform-ask-deployment-attach",
	prompt: [
		"hey, setting up billing for our docs platform. two paid plans, pro and growth —",
		"pro is $180/month or $1,800/year, growth is $500/month or $5,000/year.",
		"pro comes with 5,000 AI credits a month, growth with 10,000 a month — annual plans still get them monthly.",
		"AI assistant messages use up credits, 1 per message.",
		"past the included credits it's $0.01 per credit, billed end of month.",
	].join(" "),
	scenario: stepScenario(),
	simulatedUser: {
		// The per-deployment shape matters to this user: a structure that
		// attaches plans to the whole account is wrong and gets corrected.
		goal: `${knowledgePlatformGoal} It matters to you that each deployment is billed on its own plan — if a proposed structure puts the whole account on one plan, correct it.`,
		facts: knowledgePlatformUserFacts,
	},
	expect: [
		...judge.conversation({
			"asked what a plan attaches to":
				"Did the agent ask the user whether a plan is bought for the whole customer account or per deployment/workspace (what the subscription attaches to)?",
			...pooledConclusionChecks,
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

initAxEval({ axCase: askDeploymentAttach, maxTurns: 24, timeoutMs: 480_000 });
