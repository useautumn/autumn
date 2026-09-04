import type { IntegrationCase } from "../../../src/cases/types/integrationCase.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../src/grading/expectations/integrationExpectations.ts";
import { initIntegrationEval } from "../../../src/initIntegrationEval.ts";
import { aiWordsCatalog } from "../catalogs/aiWordsCatalog.ts";
import { fixtureUser, integrateScenario } from "../integrateShared.ts";

/**
 * LOCK flow: cost unknown until the run finishes. The agent must reserve
 * balance with check + lock, then balances.finalize with the actual cost —
 * plain check-then-track leaves failed runs charged and concurrent runs
 * double-spending. runGeneration is frozen product logic: cost = 2× the
 * prompt's word count, so a 50-word probe must record exactly 100.
 */
const generateHelper = `/** The product's generation engine — cost is only known once it finishes.
 * Do not modify: billing wraps AROUND this. */
export const runGeneration = async ({
	prompt,
}: {
	prompt: string;
}): Promise<{ output: string; unitsUsed: number }> => {
	const words = prompt.trim().split(/\\s+/);
	return {
		output: words.slice().reverse().join(" "),
		unitsUsed: words.length * 2,
	};
};
`;

const generateRouteStub = `		// AI generate. runGeneration is the product logic — don't modify it;
		// billing wraps around it. TODO: charge for what a run actually uses.
		"/api/generate": {
			POST: async (req) => {
				const user = getUser();
				const { prompt } = (await req.json()) as { prompt: string };
				const result = await runGeneration({ prompt });
				return Response.json({ ...result, user: user.id });
			},
		},
`;

const promptOf = (wordCount: number) => "word ".repeat(wordCount).trim();

export const lockFinalize: IntegrationCase = {
	name: "integrate-lock-finalize",
	fixture: "notes-api",
	catalogConfig: aiWordsCatalog,
	scenario: integrateScenario,
	existingFiles: {
		"src/generate.ts": generateHelper,
		"src/index.ts": `import { getUser } from "./auth.ts";
import { runGeneration } from "./generate.ts";
import { summarizeNote } from "./notes.ts";

const port = Number(process.env.PORT ?? 3456);

Bun.serve({
	port,
	routes: {
		"/health": () => Response.json({ ok: true }),

		// The product: paste a note, get a summary back.
		"/api/summarize": {
			POST: async (req) => {
				const user = getUser();
				const { text } = (await req.json()) as { text: string };
				const result = await summarizeNote(user.id, text);
				return Response.json({ ...result, user: user.id });
			},
		},

${generateRouteStub}	},
});

console.log(\`acme-notes-api listening on :\${port}\`);
`,
	},
	prompt: [
		"hey — our AI generate endpoint's cost isn't known until it finishes (depends on output length).",
		"can you make sure users can't start a run without balance, and that they only get charged",
		"what the run actually used? if a run fails they shouldn't be charged at all.",
	].join(" "),
	probes: [{ path: "/api/generate", body: { prompt: promptOf(50) } }],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("generate succeeds", { call: 1, status: 200 }),
		integration.customerCreated({ email: fixtureUser.email }),
		integration.usageRecorded({ featureId: "words", usage: 100 }),
		integration.diffRequires("uses the lock/finalize flow", {
			pattern: /finalize|lock/i,
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: lockFinalize,
	maxTurns: 16,
	timeoutMs: 480_000,
});
