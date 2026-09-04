import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	starterSpec,
	teamAnnualSpec,
	teamSpec,
	workspacePlanSpec,
	workspaceSeatsConfig,
} from "./workspaceSeatsPricing.ts";

/**
 * KIND A: the whole brief in one message — allusive on purpose: the billable
 * unit is "a workspace", never "seat-based" or "per user". Grades all three
 * signatures — unit-that-grants → license plan (①), per-workspace grant on
 * the workspace plan vs shared prepaid on the base plans (②), one workspace
 * plan reused with per-tier included counts (③) — plus the annual variant
 * and credit system.
 */
export const oneShot = defineCase({
	name: "workspace-seats-one-shot",
	prompt: [
		"hey, setting up billing for our integration platform. everything runs on credits — 1 action call costs 1 credit.",
		"two main plans: Starter has no base fee, Team is $600/month (or $6,000/year, annual credits still reset monthly). customers pick a plan themselves — nobody starts on one automatically.",
		"customers connect workspaces to the platform — every workspace they add runs $10 a month on Team, $15 on Starter. Starter comes with 1, Team comes with 10, and they can always add more.",
		"each workspace gets its own 1,000 credits a month to use — except on Starter, where a workspace only gets 500.",
		"they can also buy shared credit packs the whole account draws from — on Team it's $20 per 20,000 credits a month, on Starter $60 per 20,000.",
		"there's also an Enterprise plan at about $25k/year, sales-led.",
		"no trials. that's everything — go ahead, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	expect: [
		conduct.mustWriteImmediately(),
		...catalog({
			features: {
				"credits (credit system)": { type: "credit_system", granted: true },
			},
			exactPlans: false,
			plans: {
				"workspace plan: $10/mo granting 1000 credits": workspacePlanSpec,
				"team: 10 workspaces included, shared prepaid $20/20k": teamSpec,
				"starter: free, 1 workspace included, prepaid $60/20k": starterSpec,
				"team annual variant": teamAnnualSpec,
			},
		}),
		config.oneLicensePlan(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: workspaceSeatsConfig(),
});

initAxEval({ axCase: oneShot, maxTurns: 24, timeoutMs: 480_000 });
