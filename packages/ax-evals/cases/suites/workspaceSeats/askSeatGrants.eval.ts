import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { judge } from "../../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	teamSpec,
	workspacePlanSpec,
	workspaceSeatsConfig,
	workspaceSeatsFacts,
	workspaceSeatsGoal,
} from "./workspaceSeatsPricing.ts";

/**
 * KIND B (manufactured twin): the workspace-grants fact is withheld from
 * the opening — and it's the fact that TRIGGERS the license fork. Without
 * it, a per-unit workspaces item would be correct; the agent must ask what
 * a workspace comes with before deriving. Passing = the question surfaced
 * AND the license structure landed.
 */
export const askSeatGrants = defineCase({
	name: "workspace-seats-ask-seat-grants",
	// The full brief minus ONE fact: what a workspace comes with (its grant).
	prompt: [
		"hey, setting up billing for our integration platform. everything runs on credits — 1 action call costs 1 credit.",
		"Starter has no base fee, Team is $600/month. nobody starts on a plan automatically — customers pick one.",
		"customers connect workspaces — every workspace they add runs $10 a month on Team, $15 on Starter. Starter comes with 1, Team comes with 10.",
		"they can also buy shared credit packs — $20 per 20,000 a month on Team, $60 per 20,000 on Starter.",
	].join(" "),
	scenario: stepScenario(),
	simulatedUser: {
		goal: workspaceSeatsGoal,
		facts: workspaceSeatsFacts,
	},
	expect: [
		...judge.conversation({
			"asked what a workspace comes with":
				"Did the agent ask the user what a workspace comes with / whether each workspace gets anything of its own (like its own credits or allowances)?",
		}),
		...catalog({
			exactPlans: false,
			plans: {
				"workspace plan: $10/mo granting 1000 credits": workspacePlanSpec,
				"team: 10 workspaces included, shared prepaid $20/20k": teamSpec,
			},
		}),
		config.oneLicensePlan(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: workspaceSeatsConfig(),
});

initAxEval({ axCase: askSeatGrants, maxTurns: 24, timeoutMs: 480_000 });
