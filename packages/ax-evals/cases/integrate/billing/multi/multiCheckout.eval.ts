import type { IntegrationCase } from "../../../../src/cases/types/integrationCase.ts";
import { conduct } from "../../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../../src/grading/expectations/integrationExpectations.ts";
import { initIntegrationEval } from "../../../../src/initIntegrationEval.ts";
import { supportAddOnCatalog } from "../../catalogs/supportAddOnCatalog.ts";
import { fixtureUser, integrateScenario } from "../../integrateShared.ts";

/**
 * MULTI-ATTACH flow: the pricing page sells the plan and the support add-on
 * as ONE purchase. The customer has no card, so payment must go through a
 * single checkout covering both. The graded trap: two sequential
 * billing.attach calls produce two checkout sessions (two payment moments) —
 * the endpoint must use billing.multiAttach and hand back its one
 * checkout_url.
 */
const checkoutRouteStub = `		// Pricing page calls this when the user confirms their selection.
		// TODO: hook up to our billing provider.
		"/api/billing/checkout": {
			POST: async (req) => {
				const user = getUser();
				const { planId, addOnIds } = (await req.json()) as {
					planId: string;
					addOnIds: string[];
				};
				return Response.json(
					{ error: "not implemented", planId, addOnIds },
					{ status: 501 },
				);
			},
		},
`;

export const multiCheckout: IntegrationCase = {
	name: "integrate-multi-checkout",
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

${checkoutRouteStub}	},
});

console.log(\`acme-notes-api listening on :\${port}\`);
`,
	},
	prompt: [
		"hey — on our pricing page people pick a plan and can toss in the priority support add-on.",
		"one checkout, they pay once — not two separate payment screens. the frontend team already",
		"stubbed the checkout endpoint in the app, can you make it actually work?",
	].join(" "),
	simulatedUser: {
		goal: "Get the pricing page's checkout endpoint working so a customer buying the plan plus the support add-on pays exactly once.",
		facts: [
			"- The plan and the support add-on are bought together in one purchase: one checkout page, one payment.",
			"- Two separate checkout screens (one per product) is exactly what you're trying to avoid — it's why you're asking.",
			"- Customers don't have a card on file yet when they buy, so they must be sent to a payment page.",
			"- The endpoint should return the payment page URL so the frontend can redirect.",
			"- The add-on is optional — some customers buy just the plan — but when both are picked they're one purchase.",
		].join("\n"),
	},
	probes: [
		{
			path: "/api/billing/checkout",
			body: { planId: "pro", addOnIds: ["support_addon"] },
		},
	],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("checkout endpoint responds 200", {
			call: 1,
			status: 200,
		}),
		integration.probeBodyHas("response carries ONE checkout URL", {
			call: 1,
			pattern: /https?:\/\/[^"]*(checkout|stripe|pay)[^"]*/i,
		}),
		integration.diffRequires("uses multiAttach for the combined purchase", {
			pattern: /multiAttach|multi_attach/,
		}),
		integration.customerCreated({ email: fixtureUser.email }),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: multiCheckout,
	maxTurns: 16,
	timeoutMs: 480_000,
});
