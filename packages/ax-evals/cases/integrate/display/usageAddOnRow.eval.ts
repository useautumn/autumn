import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../src/grading/expectations/integrationExpectations.ts";
import { initIntegrationEval } from "../../../src/initIntegrationEval.ts";
import type { IntegrationCase } from "../../../src/cases/types/integrationCase.ts";
import { messagingCatalog } from "../catalogs/messagingCatalog.ts";
import { fixtureUser, integrateScenario } from "../integrateShared.ts";

/**
 * DISPLAY flow: usage-priced add-on row with an estimated accrued cost. The
 * automations add-on includes 1,000 runs/month, then bills overage on
 * graduated tiers ($0.05 first 1,000 overage runs, $0.02 after). Seeded
 * usage is 3,500 → overage 2,500 → estimated cost 1,000×0.05 + 1,500×0.02 =
 * $80. The pricing lives on the breakdown entry's `price` (tiers,
 * tierBehavior, billingUnits) — the graded trap: naive code treats the row
 * as a flat price (showing $0 or the tier rate itself) instead of computing
 * the accrued estimate from usage beyond the included grant.
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

export const usageAddOnRow: IntegrationCase = {
	name: "integrate-display-usage-addon",
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
		attach: [{ plan_id: "transactional_pro" }, { plan_id: "automations" }],
		track: [{ feature_id: "automation_runs", value: 3500 }],
	},
	prompt: [
		"hey — billing page time. the frontend stubbed /api/billing/summary; can you build it? for the",
		"automations add-on the row should show how many runs they've used this billing period and an",
		"estimated cost so far — runs past what's included get billed at the end of the month, and people",
		"keep getting surprised by that line on the invoice. our other plans just show name + price.",
	].join(" "),
	probes: [{ path: "/api/billing/summary", method: "GET" }],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("summary endpoint responds 200", {
			call: 1,
			status: 200,
		}),
		integration.usageRecorded({ featureId: "automation_runs", usage: 3500 }),
		integration.probeBodyHas("runs used this period (3,500) is shown", {
			call: 1,
			pattern: /(?<![\w.])3,?500(?![\w.])/,
		}),
		integration.probeBodyHas(
			"estimated accrued cost is $80 (1,000×$0.05 + 1,500×$0.02)",
			{ call: 1, pattern: /(?<![\w.])(80(\.0+)?|8,?000)(?![\w.])/ },
		),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: usageAddOnRow,
	maxTurns: 16,
	timeoutMs: 480_000,
});
