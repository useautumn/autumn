import type { IntegrationCase } from "../../../src/cases/types/integrationCase.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../src/grading/expectations/integrationExpectations.ts";
import { initIntegrationEval } from "../../../src/initIntegrationEval.ts";
import { aiWordsCatalog } from "../catalogs/aiWordsCatalog.ts";
import { fixtureUser, integrateScenario } from "../integrateShared.ts";

/**
 * CHECK flow: variable-cost gating. A summarize costs as many words as the
 * note; the free plan grants 1,000 words a month. The graded trap: the agent
 * must pass requiredBalance: N on check and value: N on track — a default
 * check (requiredBalance 1) lets a 600-word job start with only 500 left.
 */
const noteOf = (wordCount: number) => "word ".repeat(wordCount).trim();

export const requiredBalance: IntegrationCase = {
	name: "integrate-required-balance",
	fixture: "notes-api",
	catalogConfig: aiWordsCatalog,
	scenario: integrateScenario,
	prompt: [
		"hey — we bill by words now: a summarize costs as many words as the note being summarized.",
		"can you wire that into the summarize endpoint? someone shouldn't be able to start a summarize",
		"they can't afford, and the usage we record should reflect the real cost of each one.",
	].join(" "),
	probes: [
		{ path: "/api/summarize", body: { text: noteOf(200) } },
		{ path: "/api/summarize", body: { text: noteOf(300) } },
		// 500 of 1,000 words remain — a 600-word note must be refused upfront.
		{ path: "/api/summarize", body: { text: noteOf(600) } },
	],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("200-word summarize succeeds", {
			call: 1,
			status: 200,
		}),
		integration.probeStatus("300-word summarize succeeds", {
			call: 2,
			status: 200,
		}),
		integration.probeBlocked("600-word summarize is refused", { call: 3 }),
		integration.customerCreated({ email: fixtureUser.email }),
		integration.usageRecorded({ featureId: "words", usage: 500 }),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: requiredBalance,
	maxTurns: 16,
	timeoutMs: 480_000,
});
