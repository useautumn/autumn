import type { IntegrationCase } from "../../../../src/cases/types/integrationCase.ts";
import { conduct } from "../../../../src/grading/expectations/conductExpectations.ts";
import { integration } from "../../../../src/grading/expectations/integrationExpectations.ts";
import { initIntegrationEval } from "../../../../src/initIntegrationEval.ts";
import { workspaceSeatsCatalog } from "../../catalogs/workspaceSeatsCatalog.ts";
import { fixtureUser, integrateScenario } from "../../integrateShared.ts";

/**
 * LICENSES flow, part 1: get on the team plan, then register workspaces.
 * Each workspace is a license assignment (licenses.attach with the entity),
 * not a bare entity insert and not a separate billing.attach of the
 * workspace plan. Team includes 10, so no quantity work yet.
 */
export const teamThenAssign: IntegrationCase = {
	name: "integrate-licenses-team-then-assign",
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

		// Billing page calls this when the user joins the team plan.
		// TODO: hook up to our billing provider.
		"/api/billing/join-team": {
			POST: async () => {
				const user = getUser();
				return Response.json({ error: "not implemented", user: user.id }, { status: 501 });
			},
		},

		// Workspace creation dialog. TODO: hook up billing so the new
		// workspace gets its plan/credits.
		"/api/workspaces": {
			POST: async (req) => {
				const user = getUser();
				const { id, name } = (await req.json()) as { id: string; name: string };
				return Response.json({ error: "not implemented", id, name }, { status: 501 });
			},
		},
	},
});

console.log(\`acme-notes-api listening on :\${port}\`);
`,
	},
	prompt: [
		"hey — our billing's a team plan at $600/mo that comes with 10 workspaces, extra ones are $10/mo each.",
		"the frontend team already stubbed the join-team and workspace endpoints in the app — can you make them work?",
		"joining puts the signed-in user's account on the team plan; registering a workspace should mean it starts",
		"drawing from its own 1,000 credits a month.",
	].join(" "),
	probes: [
		{ path: "/api/billing/join-team", body: {} },
		{ path: "/api/workspaces", body: { id: "ws_1", name: "Design" } },
		{ path: "/api/workspaces", body: { id: "ws_2", name: "Marketing" } },
	],
	oracleCustomerId: fixtureUser.id,
	expect: [
		integration.appBoots(),
		integration.probeStatus("join-team succeeds", { call: 1, status: 200 }),
		integration.probeStatus("workspace 1 registered", { call: 2, status: 200 }),
		integration.probeStatus("workspace 2 registered", { call: 3, status: 200 }),
		integration.planAttached({ planId: "team" }),
		integration.licensesAssigned({
			planId: "workspace",
			entityIds: ["ws_1", "ws_2"],
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
};

initIntegrationEval({
	integrationCase: teamThenAssign,
	maxTurns: 16,
	timeoutMs: 480_000,
});
