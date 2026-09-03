import type { IntegrationCase } from "../../../src/cases/types/integrationCase.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../src/grading/expectations/integrationExpectations.ts";
import { initIntegrationEval } from "../../../src/initIntegrationEval.ts";
import { concurrentWorkflowsCatalog } from "../catalogs/concurrentWorkflowsCatalog.ts";
import { fixtureUser, integrateScenario } from "../integrateShared.ts";

/**
 * TRACK flow: non-consumable level. workflows counts slots IN USE, so usage
 * must move up on start and back down on stop. The graded trap: a
 * track-and-forget integration never frees a slot — the third start after a
 * stop stays blocked, and final usage drifts above 2.
 */
export const concurrentLimit: IntegrationCase = {
	name: "integrate-concurrent-limit",
	fixture: "notes-api",
	catalogConfig: concurrentWorkflowsCatalog,
	scenario: integrateScenario,
	prompt: [
		"hey — users can only run 2 workflows at a time on the free plan.",
		"can you add start/stop workflow endpoints? starting should fail when they're at their limit,",
		"and stopping frees a slot. requests carry a workflowId so stop knows which one.",
	].join(" "),
	probes: [
		{ path: "/api/workflows/start", body: { workflowId: "wf_a" } },
		{ path: "/api/workflows/start", body: { workflowId: "wf_b" } },
		{ path: "/api/workflows/start", body: { workflowId: "wf_c" } },
		{ path: "/api/workflows/stop", body: { workflowId: "wf_a" } },
		{ path: "/api/workflows/start", body: { workflowId: "wf_c" } },
	],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("workflow A starts", { call: 1, status: 200 }),
		integration.probeStatus("workflow B starts", { call: 2, status: 200 }),
		integration.probeBlocked("third concurrent start is refused", { call: 3 }),
		integration.probeStatus("workflow A stops", { call: 4, status: 200 }),
		integration.probeStatus("freed slot lets C start", {
			call: 5,
			status: 200,
		}),
		integration.customerCreated({ email: fixtureUser.email }),
		integration.usageRecorded({ featureId: "workflows", usage: 2 }),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: concurrentLimit,
	maxTurns: 16,
	timeoutMs: 480_000,
});
