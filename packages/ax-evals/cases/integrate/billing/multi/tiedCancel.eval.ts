import type { IntegrationCase } from "../../../../src/cases/types/integrationCase.ts";
import { conduct } from "../../../../src/grading/expectations/conductExpectations.ts";
import {
	integration,
	plansCanceled,
} from "../../../../src/grading/expectations/integrationExpectations.ts";
import { judge } from "../../../../src/grading/expectations/judgeExpectations.ts";
import { initIntegrationEval } from "../../../../src/initIntegrationEval.ts";
import { supportAddOnCatalog } from "../../catalogs/supportAddOnCatalog.ts";
import { fixtureUser, integrateScenario } from "../../integrateShared.ts";

/**
 * MULTI-UPDATE flow: the subscriber is on Pro AND the support add-on. When
 * they cancel from the billing page, everything must stop — the blessed call
 * is ONE billing.multiUpdate canceling both plans together. The graded trap:
 * an agent that only cancels the base plan leaves the customer paying $50/mo
 * for an add-on they forgot about. The prompt never names the add-on; the
 * agent must discover it (seeded customer / catalog) or ask.
 */
const cancelRouteStub = `		// Billing page calls this when the user hits "cancel subscription".
		// TODO: hook up to our billing provider.
		"/api/billing/cancel": {
			POST: async (req) => {
				const user = getUser();
				return Response.json({ error: "not implemented" }, { status: 501 });
			},
		},
`;

export const tiedCancel: IntegrationCase = {
	name: "integrate-multi-tied-cancel",
	fixture: "notes-api",
	catalogConfig: supportAddOnCatalog,
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

${cancelRouteStub}	},
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
		attach: [{ plan_id: "pro" }, { plan_id: "support_addon" }],
	},
	prompt: [
		"hey — when someone cancels their subscription from the billing page, everything they're",
		"paying for should stop. they shouldn't keep getting billed for stuff they forgot about.",
		"the frontend team stubbed the cancel endpoint, can you finish it?",
	].join(" "),
	simulatedUser: {
		goal: "Get the billing page's cancel endpoint working so canceling stops every recurring charge the customer has — the plan and anything bought alongside it.",
		facts: [
			"- The plan and the priority support add-on are bought together and must cancel together.",
			"- A canceled customer must not keep getting billed for the add-on — that's the bug you're preempting.",
			"- Cancellation should take effect at the end of the current billing period, not refund immediately.",
			"- Some customers are on the pro plan plus the $50/mo support add-on; the cancel flow has to cover both.",
		].join("\n"),
	},
	probes: [{ path: "/api/billing/cancel", body: {} }],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("cancel endpoint responds 200", {
			call: 1,
			status: 200,
		}),
		plansCanceled({ planIds: ["pro", "support_addon"] }),
		integration.diffRequires("uses multiUpdate for the tied cancel", {
			pattern: /multiUpdate|multi_update/,
		}),
		...judge.conversation({
			"surfaced the tied add-on": [
				"Did the agent surface that the customer's add-on cancels together with the base plan —",
				"either by asking/confirming with the user that the add-on is tied to the plan, or by",
				"discovering the add-on itself (reading the customer's subscriptions or the catalog) and",
				"stating it would cancel both?",
			].join(" "),
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: tiedCancel,
	maxTurns: 16,
	timeoutMs: 480_000,
});
