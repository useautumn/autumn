import type { IntegrationCase } from "../../../../src/cases/types/integrationCase.ts";
import { conduct } from "../../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../../src/grading/expectations/integrationExpectations.ts";
import { initIntegrationEval } from "../../../../src/initIntegrationEval.ts";
import { workspaceSeatsCatalog } from "../../catalogs/workspaceSeatsCatalog.ts";
import { fixtureUser, integrateScenario } from "../../integrateShared.ts";

const seededWorkspaces = Array.from({ length: 8 }, (_, index) => ({
	plan_id: "workspace",
	entity_id: `ws_${index + 1}`,
	name: `Workspace ${index + 1}`,
	feature_id: "workspaces",
}));

const invitedWorkspaces = [
	{ id: "ws_9", name: "Support" },
	{ id: "ws_10", name: "Legal" },
	{ id: "ws_11", name: "Ops" },
	{ id: "ws_12", name: "Data" },
];

/**
 * LICENSES flow, part 2: batch assignment past capacity. The customer is on
 * Team (10 workspaces included) with 8 already assigned; the app's add
 * dialog registers 4 at once. Capacity is enforced, never auto-purchased:
 * licenses.attach fails with 2 remaining < 4 needed. The endpoint must
 * notice the shortfall, billing.update the license quantity to 12 (paying
 * for 2 extra), THEN assign all 4 — order matters. Naive agents get the 400
 * and give up, or assign only 2.
 */
export const inviteBatch: IntegrationCase = {
	name: "integrate-licenses-invite-batch",
	fixture: "notes-api",
	catalogConfig: workspaceSeatsCatalog,
	scenario: integrateScenario,
	seedCustomer: {
		customer: {
			id: fixtureUser.id,
			name: "Ada Lovelace",
			email: fixtureUser.email,
		},
		paymentMethod: true,
		attach: [{ plan_id: "team" }],
		licenseAssignments: seededWorkspaces,
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

		// The 'add workspaces' dialog posts its selection here. TODO: hook
		// up billing so the new workspaces get their plans/credits.
		"/api/workspaces/batch": {
			POST: async (req) => {
				const user = getUser();
				const { workspaces } = (await req.json()) as {
					workspaces: { id: string; name: string }[];
				};
				return Response.json(
					{ error: "not implemented", count: workspaces.length, user: user.id },
					{ status: 501 },
				);
			},
		},
	},
});

console.log(\`acme-notes-api listening on :\${port}\`);
`,
	},
	prompt: [
		"hey — accounts are on our team plan ($600/mo, 10 workspaces included, extra workspaces $10/mo).",
		"the app has an 'add workspaces' dialog where you pick several at once — the frontend team already",
		"stubbed the endpoint behind it. can you make it work? it should just work no matter how many they add —",
		"if they're past what their plan includes, they pay for the extras, don't make them think about it.",
	].join(" "),
	probes: [
		{ path: "/api/workspaces/batch", body: { workspaces: invitedWorkspaces } },
	],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("batch add succeeds", { call: 1, status: 200 }),
		integration.licensesAssigned({
			planId: "workspace",
			entityIds: [
				...seededWorkspaces.map((workspace) => workspace.entity_id),
				...invitedWorkspaces.map((workspace) => workspace.id),
			],
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: inviteBatch,
	maxTurns: 16,
	timeoutMs: 480_000,
});
