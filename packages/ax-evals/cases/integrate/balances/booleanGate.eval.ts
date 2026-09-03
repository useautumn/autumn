import type { IntegrationCase } from "../../../src/cases/types/integrationCase.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../src/grading/expectations/integrationExpectations.ts";
import { initIntegrationEval } from "../../../src/initIntegrationEval.ts";
import { booleanGateCatalog } from "../catalogs/booleanGateCatalog.ts";
import { fixtureUser, integrateScenario } from "../integrateShared.ts";

/**
 * CHECK flow: boolean gate. custom_branding is an on/off pro feature; the
 * fresh user auto-lands on the free plan, so the branding endpoint must be
 * refused. The graded trap: boolean features are check-only — an agent that
 * also tracks usage for one fails diffAvoids.
 */
const brandingRouteStub = `		// Branding settings save. TODO: paid-plan gating.
		"/api/branding": {
			POST: async (req) => {
				const user = getUser();
				const { logoUrl } = (await req.json()) as { logoUrl: string };
				return Response.json({ error: "not implemented", logoUrl }, { status: 501 });
			},
		},
`;

export const booleanGate: IntegrationCase = {
	name: "integrate-boolean-gate",
	fixture: "notes-api",
	catalogConfig: booleanGateCatalog,
	scenario: integrateScenario,
	existingFiles: {
		"src/index.ts": `import { getUser } from "./auth.ts";
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

${brandingRouteStub}	},
});

console.log(\`acme-notes-api listening on :\${port}\`);
`,
	},
	prompt: [
		"hey — custom branding is a paid-plan thing now. can you gate the branding endpoint",
		"so free users can't use it? the route's already stubbed in the app.",
	].join(" "),
	probes: [
		{ path: "/api/branding", body: { logoUrl: "https://acme.dev/logo.png" } },
	],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeBlocked("free user's branding call is refused", {
			call: 1,
		}),
		integration.customerCreated({ email: fixtureUser.email }),
		integration.diffAvoids("no track call for a boolean gate", {
			pattern: /\btrack\s*\(/i,
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: booleanGate,
	maxTurns: 16,
	timeoutMs: 480_000,
});
