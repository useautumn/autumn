import type { IntegrationCase } from "../../../../src/cases/types/integrationCase.ts";
import { conduct } from "../../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../../src/grading/expectations/integrationExpectations.ts";
import { initIntegrationEval } from "../../../../src/initIntegrationEval.ts";
import { knowledgePlatformCatalog } from "../../catalogs/knowledgePlatformCatalog.ts";
import { fixtureUser, integrateScenario } from "../../integrateShared.ts";

/**
 * ATTACH flow: pro_trial is a DEFAULT plan (autoEnable): creating the customer is
 * enough — Autumn puts them on the trial. The graded trap: an agent that
 * doesn't understand default plans will call billing.attach("pro_trial")
 * anyway, or worse, gate on it manually.
 */
export const trialNoAttach: IntegrationCase = {
	name: "integrate-trial-no-attach",
	fixture: "notes-api",
	catalogConfig: knowledgePlatformCatalog,
	scenario: integrateScenario,
	prompt: [
		"hey — our billing's set up in autumn: new users start on a 14-day pro trial with 500 AI credits,",
		"then there's a paid pro plan. can you wire the app up so users get created in autumn and",
		"the summarize endpoint checks + records credits? nothing to buy yet — just make sure a brand",
		"new user lands on their trial automatically and can summarize.",
	].join(" "),
	probes: [
		{
			path: "/api/summarize",
			body: { text: "first note from a brand new trial user" },
		},
	],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("summarize succeeds for a new user", {
			call: 1,
			status: 200,
		}),
		integration.customerCreated({ email: fixtureUser.email }),
		integration.planAttached({ planId: "pro_trial" }),
		integration.usageRecorded({ featureId: "ai_credits", usage: 1 }),
		integration.diffAvoids("no attach call for the default trial", {
			pattern: /attach/i,
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: trialNoAttach,
	maxTurns: 16,
	timeoutMs: 480_000,
});
