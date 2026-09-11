import type { IntegrationCase } from "../../../../src/cases/types/integrationCase.ts";
import { conduct } from "../../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../../src/grading/expectations/integrationExpectations.ts";
import { initIntegrationEval } from "../../../../src/initIntegrationEval.ts";
import { emailCreditsCatalog } from "../../catalogs/emailCreditsCatalog.ts";
import { fixtureUser, integrateScenario } from "../../integrateShared.ts";

/**
 * BILLING CONTROLS flow: usage alerts. "Email users at 80% of their credits"
 * maps to customers.update billing_controls.usage_alerts with
 * threshold: 80 + threshold_type: "usage_percentage" — Autumn fires the
 * webhook; the app does NOT poll balances or run its own threshold cron.
 * The graded trap: agents that meter it themselves (check-on-every-track,
 * a scheduled job) instead of arming the alert control.
 */
const alertSettingsRouteStub = `		// Settings page: usage warning email opt-in. TODO: wire to billing provider.
		"/api/billing/usage-alerts": {
			POST: async (req) => {
				const user = getUser();
				const { enabled } = (await req.json()) as { enabled: boolean };
				return Response.json({ error: "not implemented", enabled }, { status: 501 });
			},
		},
`;

export const usageAlerts: IntegrationCase = {
	name: "integrate-usage-alerts",
	fixture: "notes-api",
	catalogConfig: emailCreditsCatalog,
	scenario: integrateScenario,
	seedCustomer: {
		customer: {
			id: fixtureUser.id,
			name: "Ada Lovelace",
			email: fixtureUser.email,
		},
		paymentMethod: true,
		attach: [{ plan_id: "growth" }],
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

${alertSettingsRouteStub}	},
});

console.log(\`acme-notes-api listening on :\${port}\`);
`,
	},
	prompt: [
		"hey — we want to email users a heads-up when they've used 80% of their",
		"email credits, so the overage bill isn't a surprise. the settings stub in",
		"the app is where they opt in — can you make it work? we don't want to build",
		"our own usage-polling job for this.",
	].join(" "),
	probes: [{ path: "/api/billing/usage-alerts", body: { enabled: true } }],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("alert opt-in succeeds", { call: 1, status: 200 }),
		integration.usageAlertSet({
			featureId: "emails",
			threshold: 80,
			thresholdType: "usage_percentage",
		}),
		integration.diffAvoids("no hand-rolled polling job", {
			pattern: /setInterval|cron/i,
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: usageAlerts,
	maxTurns: 16,
	timeoutMs: 480_000,
});
