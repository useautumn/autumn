import type { IntegrationCase } from "../../../../src/cases/types/integrationCase.ts";
import { conduct } from "../../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../../src/grading/expectations/integrationExpectations.ts";
import { initIntegrationEval } from "../../../../src/initIntegrationEval.ts";
import { messagingFreeCatalog } from "../../catalogs/messagingFreeCatalog.ts";
import { fixtureUser, integrateScenario } from "../../integrateShared.ts";

const dailyCapRouteStub = `		// Signup hook: apply free-tier sending policy. TODO: wire to billing provider.
		"/api/billing/daily-cap": {
			POST: async (req) => {
				const user = getUser();
				return Response.json({ error: "not implemented", user: user.id }, { status: 501 });
			},
		},
`;

export const dailyLimit: IntegrationCase = {
	name: "integrate-daily-limit",
	fixture: "notes-api",
	catalogConfig: messagingFreeCatalog,
	scenario: integrateScenario,
	seedCustomer: {
		customer: {
			id: fixtureUser.id,
			name: "Ada Lovelace",
			email: fixtureUser.email,
		},
	},
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

${dailyCapRouteStub}	},
});

console.log(\`acme-notes-api listening on :\${port}\`);
`,
	},
	prompt: [
		"hey — free users get 3k emails a month but we also don't want them burning",
		"it all in one blast — cap them at 100 a day too. the app already calls the",
		"daily-cap stub when a free user signs up; can you make it actually apply",
		"the cap for them? don't build our own counter for this.",
	].join(" "),
	probes: [{ path: "/api/billing/daily-cap", body: {} }],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("daily-cap request succeeds", {
			call: 1,
			status: 200,
		}),
		integration.usageLimitSet({
			featureId: "emails",
			limit: 100,
			interval: "day",
		}),
		integration.diffAvoids("no hand-rolled daily counter", {
			pattern: /setInterval|cron/i,
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: dailyLimit,
	maxTurns: 16,
	timeoutMs: 480_000,
});
