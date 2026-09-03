import type { IntegrationCase } from "../../../src/cases/types/integrationCase.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../src/grading/expectations/integrationExpectations.ts";
import { initIntegrationEval } from "../../../src/initIntegrationEval.ts";
import { freeTierCatalog } from "../catalogs/freeTierCatalog.ts";
import { fixtureUser, integrateScenario } from "../integrateShared.ts";

/**
 * GATING flow, bring-up case: the canonical gate-and-meter loop. Free plan
 * allows 3 summaries a month; the endpoint must create the customer, check
 * before summarizing, track after. Probes exhaust the limit as the fixture's
 * fixed user; the oracle confirms customer + usage in the run org.
 */
export const gateAndMeter: IntegrationCase = {
	name: "integrate-gate-and-meter",
	fixture: "notes-api",
	catalogConfig: freeTierCatalog,
	scenario: integrateScenario,
	prompt: [
		"hey — we just set up our billing plans in autumn (free plan, 3 summaries a month).",
		"can you wire that into the app? the summarize endpoint should stop working once someone's used up their 3,",
		"and usage should actually get recorded. that's the whole job for now — no payment flows yet.",
	].join(" "),
	probes: [
		{
			path: "/api/summarize",
			body: { text: "note one about the quarterly planning meeting" },
			repeat: 4,
		},
	],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("summaries 1-3 succeed", { call: 3, status: 200 }),
		integration.probeBlocked("4th summary is refused", { call: 4 }),
		integration.customerCreated({ email: fixtureUser.email }),
		integration.usageRecorded({ featureId: "summaries", usage: 3 }),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: gateAndMeter,
	maxTurns: 16,
	timeoutMs: 480_000,
});
