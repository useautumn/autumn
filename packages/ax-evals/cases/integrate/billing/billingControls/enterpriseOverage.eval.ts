import type { IntegrationCase } from "../../../../src/cases/types/integrationCase.ts";
import { conduct } from "../../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../../src/grading/expectations/integrationExpectations.ts";
import type { Expectation } from "../../../../src/grading/types/expectation.ts";
import { initIntegrationEval } from "../../../../src/initIntegrationEval.ts";
import type { AxRunOutput } from "../../../../src/types/axRunOutput.ts";
import { crawlCreditsCatalog } from "../../catalogs/crawlCreditsCatalog.ts";
import { fixtureUser, integrateScenario } from "../../integrateShared.ts";

/**
 * BILLING CONTROLS flow: enterprise overage grants. The scale plan's credit
 * item is a pure grant (no usage price) — zero balance is a hard stop by
 * default, so overage capability doesn't exist on the plan; it must be
 * granted PER CUSTOMER via the overage_allowed billing control, capped by a
 * spend_limits.overage_limit (~20% of the allowance) so the run-over isn't
 * unlimited. Because no usage price exists, that overage is permitted, not
 * billed — the agent should flag that, not fake it. The graded traps:
 * pattern-matching the priced-overage shape and reaching for
 * skip_overage_billing (wrong direction — that DISABLES billing), or adding
 * a usage price to the catalog (a catalog change, forbidden here).
 */
const overageGrantRouteStub = `		// Account management: grant a customer overage on their crawl credits. TODO: wire to billing provider.
		"/api/billing/overage-grant": {
			POST: async (req) => {
				const user = getUser();
				const { enabled } = (await req.json()) as { enabled: boolean };
				return Response.json({ error: "not implemented", enabled }, { status: 501 });
			},
		},
`;

/** ~20% headroom over the 100k-credit grant, in either legitimate encoding:
 * usage_percentage 20, or absolute 20,000 units. */
const overageCapConfigured = (): Expectation => {
	const name = "20% overage cap configured";
	return {
		name,
		kind: "config",
		score: (output: AxRunOutput) => {
			const entry = (output.oracle?.billing_controls?.spend_limits ?? []).find(
				(candidate) => candidate.feature_id === "credits",
			);
			const passed =
				entry !== undefined &&
				entry.enabled === true &&
				((entry.limit_type === "usage_percentage" &&
					entry.overage_limit === 20) ||
					((entry.limit_type === "absolute" ||
						entry.limit_type === undefined) &&
						entry.overage_limit === 20000));
			return {
				name,
				score: passed ? 1 : 0,
				metadata: passed
					? undefined
					: {
							why: entry
								? `spend limit is ${JSON.stringify(entry)}, expected usage_percentage 20 or absolute 20000`
								: "no spend_limits entry for credits",
							spend_limits: output.oracle?.billing_controls?.spend_limits,
						},
			};
		},
	};
};

/** the catalog was never edited or re-pushed — overage capability must come
 * from billing controls, not a usage price added to the item */
const catalogUntouched = (): Expectation => {
	const name = "did not change the catalog";
	return {
		name,
		kind: "conduct",
		score: (output: AxRunOutput) => {
			const offending = output.toolUses.filter(
				(tool) =>
					((tool.name === "Write" || tool.name === "Edit") &&
						String(tool.input.file_path ?? "").endsWith(
							"autumn.config.ts",
						)) ||
					(tool.name === "Bash" &&
						/\batmn\b[^\n]*\bpush\b/.test(String(tool.input.command ?? ""))),
			);
			return {
				name,
				score: offending.length === 0 ? 1 : 0,
				metadata:
					offending.length === 0
						? undefined
						: {
								why: "the agent edited or re-pushed autumn.config.ts — overage here is a billing-control grant, not a catalog change",
								tools: offending.map(
									(tool) =>
										`${tool.name}: ${String(tool.input.file_path ?? tool.input.command ?? "").slice(0, 100)}`,
								),
							},
			};
		},
	};
};

export const enterpriseOverage: IntegrationCase = {
	name: "integrate-enterprise-overage",
	fixture: "notes-api",
	catalogConfig: crawlCreditsCatalog,
	scenario: integrateScenario,
	seedCustomer: {
		customer: {
			id: fixtureUser.id,
			name: "Ada Lovelace",
			email: fixtureUser.email,
		},
		paymentMethod: true,
		attach: [{ plan_id: "scale" }],
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

${overageGrantRouteStub}	},
});

console.log(\`acme-notes-api listening on :\${port}\`);
`,
	},
	prompt: [
		"hey — our big customers hate hard stops. when a scale customer's credits",
		"run out mid-crawl we want to let them keep going for a while instead of",
		"failing, but not unlimited — cap it around 20% over their included amount.",
		"the account team flips this per customer through the overage-grant stub in",
		"the app; can you wire it up? don't touch the plans themselves.",
	].join(" "),
	probes: [{ path: "/api/billing/overage-grant", body: { enabled: true } }],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("overage-grant request succeeds", {
			call: 1,
			status: 200,
		}),
		integration.overageAllowedSet({ featureId: "credits", enabled: true }),
		overageCapConfigured(),
		catalogUntouched(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: enterpriseOverage,
	maxTurns: 16,
	timeoutMs: 480_000,
});
