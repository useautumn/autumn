import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../src/grading/expectations/integrationExpectations.ts";
import { initIntegrationEval } from "../../../src/initIntegrationEval.ts";
import type { IntegrationCase } from "../../../src/cases/types/integrationCase.ts";
import { messagingCatalog } from "../catalogs/messagingCatalog.ts";
import { fixtureUser, integrateScenario } from "../integrateShared.ts";

/**
 * DISPLAY flow: scheduled downgrade. Seeding attaches Marketing Pro then
 * Marketing Free — a downgrade within the group, which the server schedules
 * for end of cycle (attach transition: upgrade = immediate, downgrade =
 * end_of_cycle). The customer object then carries BOTH: marketing_pro
 * (status "active") and marketing_free (status "scheduled"). The graded
 * traps: the scheduled plan has no balance breakdown yet (its grant kicks
 * in at activation — quota must come from the catalog, not the breakdown),
 * and its switch date is the ACTIVE sibling's currentPeriodEnd. Naive code
 * filters to status === "active" and the pending change vanishes.
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

export const scheduledDowngradeRow: IntegrationCase = {
	name: "integrate-display-scheduled-row",
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
		// Second attach is a downgrade within the marketing group → the server
		// schedules it, leaving an active pro + a scheduled free sub.
		attach: [{ plan_id: "marketing_pro" }, { plan_id: "marketing_free" }],
	},
	prompt: [
		"hey — the billing page needs its data endpoint. the frontend team stubbed /api/billing/summary;",
		"can you build it? show what plan the user is on, what it includes, and — this matters — if they've",
		"downgraded, show the plan they're moving to and the date the change kicks in. support was getting",
		"tickets because people couldn't tell their downgrade went through.",
	].join(" "),
	probes: [{ path: "/api/billing/summary", method: "GET" }],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("summary endpoint responds 200", {
			call: 1,
			status: 200,
		}),
		integration.probeBodyHas("current plan (marketing_pro) is shown", {
			call: 1,
			pattern: /marketing.?pro/i,
		}),
		integration.probeBodyHas("the scheduled plan (marketing_free) is shown", {
			call: 1,
			pattern: /marketing.?free/i,
		}),
		integration.probeBodyHas(
			"a switch date is shown (epoch-ms or ISO date in the response)",
			{ call: 1, pattern: /1[7-9]\d{11}|20\d{2}-\d{2}-\d{2}/ },
		),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: scheduledDowngradeRow,
	maxTurns: 16,
	timeoutMs: 480_000,
});
