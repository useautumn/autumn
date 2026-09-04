import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	starterSpec,
	teamSpec,
	workspacePlanSpec,
	workspaceSeatsConfig,
} from "./workspaceSeatsPricing.ts";

/**
 * KIND C (step-seed): team + workspace plan + annual + enterprise already
 * exist; the user adds Starter. The right conclusion REUSES the existing
 * workspace plan (`licenses` pointing at it, included: 1) with Starter's
 * own worse prepaid rate. Graded wrongs: minting a second workspace plan
 * (oneLicensePlan), a per-unit item on starter, or touching team/workspace.
 */
export const seedStarterReuse = defineCase({
	name: "workspace-seats-seed-starter-reuse",
	prompt: [
		"we've already got Team set up in autumn.config.ts (with the workspace plan, annual variant, and enterprise).",
		"we're adding a Starter plan now: it's free and comes with 1 workspace.",
		"two differences from Team: on Starter an extra workspace is $15 a month (not $10), and a workspace only gets 500 credits a month, not 1,000.",
		"starter customers can buy the shared credit packs too, but at $60 per 20,000 credits a month instead of $20.",
		"go ahead and add it, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	existingFiles: {
		"autumn.config.ts": workspaceSeatsConfig({ withStarter: false }),
	},
	expect: [
		...catalog({
			exactPlans: false,
			plans: {
				"existing workspace plan untouched": workspacePlanSpec,
				"existing team untouched": teamSpec,
				"starter: free, 1 workspace included, prepaid $60/20k": starterSpec,
			},
		}),
		config.planCount(5),
		config.oneLicensePlan(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: workspaceSeatsConfig(),
});

initAxEval({ axCase: seedStarterReuse, maxTurns: 24, timeoutMs: 480_000 });
