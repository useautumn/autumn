import type { IntegrationCase } from "../../../../src/cases/types/integrationCase.ts";
import { conduct } from "../../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../../src/grading/expectations/integrationExpectations.ts";
import { initIntegrationEval } from "../../../../src/initIntegrationEval.ts";
import { knowledgePlatformCatalog } from "../../catalogs/knowledgePlatformCatalog.ts";
import { fixtureUser, integrateScenario } from "../../integrateShared.ts";

/**
 * ATTACH flow: billing-page upgrade. The trial user picks Pro (or Pro Annual). They
 * have no card on file, so billing.attach returns a checkout_url — the
 * endpoint must hand that URL back so the frontend can redirect. The graded
 * trap: an agent that assumes attach just succeeds and returns { success }
 * leaves the user with no way to pay.
 *
 * The human is vague ("users can upgrade to pro"); the deterministic contract
 * (route path, body shape) is pinned by a stub the frontend team already
 * committed — like a real repo.
 */
const upgradeRouteStub = `		// Billing page calls this when the user picks a plan. TODO: hook up
		// to our billing provider.
		"/api/billing/upgrade": {
			POST: async (req) => {
				const user = getUser();
				const { planId } = (await req.json()) as { planId: string };
				return Response.json({ error: "not implemented", planId }, { status: 501 });
			},
		},
`;

export const checkoutUpgrade: IntegrationCase = {
	name: "integrate-checkout-upgrade",
	fixture: "notes-api",
	catalogConfig: knowledgePlatformCatalog,
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

${upgradeRouteStub}	},
});

console.log(\`acme-notes-api listening on :\${port}\`);
`,
	},
	prompt: [
		"hey — the billing page is going in. users on the trial should be able to just upgrade to pro",
		"(or the annual one) and pay. the frontend team already stubbed the upgrade endpoint in the app,",
		"can you make it actually work?",
	].join(" "),
	probes: [{ path: "/api/billing/upgrade", body: { planId: "pro" } }],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("upgrade endpoint responds 200", {
			call: 1,
			status: 200,
		}),
		integration.probeBodyHas("response carries a checkout URL", {
			call: 1,
			pattern: /https?:\/\/[^"]*(checkout|stripe|pay)[^"]*/i,
		}),
		integration.customerCreated({ email: fixtureUser.email }),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: checkoutUpgrade,
	maxTurns: 16,
	timeoutMs: 480_000,
});
