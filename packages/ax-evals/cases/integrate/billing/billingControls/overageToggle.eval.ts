import type { IntegrationCase } from "../../../../src/cases/types/integrationCase.ts";
import { conduct } from "../../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../../src/grading/expectations/integrationExpectations.ts";
import type { Expectation } from "../../../../src/grading/types/expectation.ts";
import { initIntegrationEval } from "../../../../src/initIntegrationEval.ts";
import type { AxRunOutput } from "../../../../src/types/axRunOutput.ts";
import { emailCreditsCatalog } from "../../catalogs/emailCreditsCatalog.ts";
import { fixtureUser, integrateScenario } from "../../integrateShared.ts";

/**
 * BILLING CONTROLS flow: the end-user overage toggle. Growth includes 500
 * emails with $0.02/email overage; the settings page gets an "overage
 * billing on/off" switch. Off must NOT mean "delete the overage price" or a
 * bare usage cap — it's a customer-level spend_limits entry with
 * skip_overage_billing: true (overage never invoiced) plus an overage_limit
 * buffer (~20% of the allowance) so the user is blocked past the headroom
 * instead of accruing unbilled usage forever. The graded trap: agents that
 * don't know skip_overage_billing exists reach for overage_allowed:false
 * (no headroom) or config.disable_overage_billing (no cap), or invent a cron.
 */
const overageSettingsRouteStub = `		// Settings page: overage billing on/off. TODO: wire to billing provider.
		"/api/billing/overage-settings": {
			POST: async (req) => {
				const user = getUser();
				const { enabled } = (await req.json()) as { enabled: boolean };
				return Response.json({ error: "not implemented", enabled }, { status: 501 });
			},
		},
`;

/** 20% headroom over the 500-email grant, in either legitimate encoding:
 * usage_percentage 20, or absolute 100 units. */
const overageBufferConfigured = (): Expectation => {
	const name = "20% overage headroom configured";
	return {
		name,
		kind: "config",
		score: (output: AxRunOutput) => {
			const entry = (output.oracle?.billing_controls?.spend_limits ?? []).find(
				(candidate) => candidate.feature_id === "emails",
			);
			const passed =
				entry !== undefined &&
				entry.enabled === true &&
				((entry.limit_type === "usage_percentage" &&
					entry.overage_limit === 20) ||
					((entry.limit_type === "absolute" ||
						entry.limit_type === undefined) &&
						entry.overage_limit === 100));
			return {
				name,
				score: passed ? 1 : 0,
				metadata: passed
					? undefined
					: {
							why: entry
								? `spend limit is ${JSON.stringify(entry)}, expected usage_percentage 20 or absolute 100`
								: "no spend_limits entry for emails",
							spend_limits: output.oracle?.billing_controls?.spend_limits,
						},
			};
		},
	};
};

export const overageToggle: IntegrationCase = {
	name: "integrate-overage-toggle",
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

${overageSettingsRouteStub}	},
});

console.log(\`acme-notes-api listening on :\${port}\`);
`,
	},
	prompt: [
		"hey — users keep getting surprise overage charges on their email credits.",
		"can you add a setting so they can turn overage billing off? when it's off they",
		"should just get stopped instead of billed — but give them a little headroom",
		"(say 20% over their included amount) before we actually cut them off.",
		"the frontend already calls the settings stub in the app.",
	].join(" "),
	probes: [{ path: "/api/billing/overage-settings", body: { enabled: false } }],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("toggle-off request succeeds", {
			call: 1,
			status: 200,
		}),
		integration.spendLimitSet({
			featureId: "emails",
			enabled: true,
			skipOverageBilling: true,
		}),
		overageBufferConfigured(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: overageToggle,
	maxTurns: 16,
	timeoutMs: 480_000,
});
