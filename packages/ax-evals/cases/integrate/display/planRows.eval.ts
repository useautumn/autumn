import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../src/grading/expectations/integrationExpectations.ts";
import { initIntegrationEval } from "../../../src/initIntegrationEval.ts";
import type { IntegrationCase } from "../../../src/cases/types/integrationCase.ts";
import { messagingCatalog } from "../catalogs/messagingCatalog.ts";
import { fixtureUser, integrateScenario } from "../integrateShared.ts";

/**
 * DISPLAY flow: per-plan rows from the balance BREAKDOWN. The customer holds
 * two product groups (Transactional Pro, Marketing Pro) plus an add-on that
 * grants MORE emails on top of the base plan — so customer-level
 * `balances.emails.granted` is 60,000 (50k plan + 10k add-on) while the
 * Transactional Pro row's included amount is 50,000, found only in the
 * breakdown entry whose planId matches. The graded trap: naive code shows
 * the merged 60,000 on the plan row.
 */
const summaryRouteStub = `		// Billing page loads this to render the subscription table. TODO: hook
		// up to our billing provider.
		"/api/billing/summary": {
			GET: async () => {
				const user = getUser();
				return Response.json({ error: "not implemented", user: user.id }, { status: 501 });
			},
		},
`;

export const planRows: IntegrationCase = {
	name: "integrate-display-plan-rows",
	fixture: "notes-api",
	catalogConfig: messagingCatalog,
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

${summaryRouteStub}	},
});

console.log(\`acme-notes-api listening on :\${port}\`);
`,
	},
	seedCustomer: {
		customer: {
			id: fixtureUser.id,
			name: "Ada Lovelace",
			email: fixtureUser.email,
		},
		paymentMethod: true,
		attach: [
			{ plan_id: "transactional_pro" },
			{ plan_id: "marketing_pro" },
			{ plan_id: "email_addon" },
		],
	},
	prompt: [
		"hey — building the billing page. the frontend team stubbed /api/billing/summary; can you make it real?",
		"it should return one row per plan the user is on: the plan name, its monthly price, and what that plan",
		"includes (the amount that comes with THAT plan). users can be on plans for both our products at once,",
		"plus add-ons.",
	].join(" "),
	probes: [{ path: "/api/billing/summary", method: "GET" }],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("summary endpoint responds 200", {
			call: 1,
			status: 200,
		}),
		integration.probeBodyHas("Transactional Pro row includes 50,000 emails", {
			call: 1,
			pattern: /(?<![\w.])50,?000(?![\w.])/,
		}),
		integration.probeBodyHas("Marketing Pro row includes 5,000 contacts", {
			call: 1,
			pattern: /(?<![\w.])5,?000(?![\w.])/,
		}),
		integration.probeBodyLacks(
			"no row shows the merged customer-level 60,000 grant",
			{ call: 1, pattern: /(?<![\w.])60,?000(?![\w.])/ },
		),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: planRows,
	maxTurns: 16,
	timeoutMs: 480_000,
});
