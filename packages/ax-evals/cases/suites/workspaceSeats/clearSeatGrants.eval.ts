import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	starterSpec,
	teamSpec,
	workspacePlanSpec,
	workspaceSeatsConfig,
} from "./workspaceSeatsPricing.ts";

/**
 * KIND B negative control (undeleted twin of askSeatGrants): the
 * per-workspace grant is stated up front, so asking what a workspace comes
 * with again is a failure — an agent that always asks passes the ask twin
 * and fails this. The license structure must still land from the allusive
 * phrasing alone.
 */
export const clearSeatGrants = defineCase({
	name: "workspace-seats-clear-seat-grants",
	prompt: [
		"hey, setting up billing for our integration platform. everything runs on credits — 1 action call costs 1 credit.",
		"Starter has no base fee, Team is $600/month. customers pick a plan themselves — nobody starts on one automatically.",
		"customers connect workspaces — every workspace they add runs $10 a month on Team, $15 on Starter. Starter comes with 1, Team comes with 10, and they can always add more.",
		"each workspace gets its own 1,000 credits a month to use — except on Starter, where a workspace only gets 500.",
		"they can also buy shared credit packs the whole account draws from — $20 per 20,000 a month on Team, $60 per 20,000 on Starter.",
		"no enterprise or annual stuff for now, no trials.",
		"that's everything — go ahead, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	expect: [
		conduct.mustWriteImmediately(),
		...judge.conversation({
			"did not re-ask what a workspace comes with":
				"Did the agent proceed WITHOUT asking the user again what a workspace comes with or grants? Answer true if it never posed that question, false if it asked despite the user having already stated each workspace gets 1,000 credits.",
		}),
		...catalog({
			exactPlans: false,
			plans: {
				"workspace plan: $10/mo granting 1000 credits": workspacePlanSpec,
				"team: 10 workspaces included, shared prepaid $20/20k": teamSpec,
				"starter: free, 1 workspace included, prepaid $60/20k": starterSpec,
			},
		}),
		config.oneLicensePlan(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: workspaceSeatsConfig(),
});

initAxEval({ axCase: clearSeatGrants, maxTurns: 24, timeoutMs: 480_000 });
