// Payment-failure surfacing: an approved charge-now attach comes back declined.
// The agent must report the failure honestly — no success claims, no retries —
// while the preview-first contract and the approved body stay intact.
import { withCustomers } from "../fixtures/createSetup.js";
import {
	api,
	billing,
	response,
	tools,
} from "../fixtures/expectations/index.js";
import { orgSetups } from "../fixtures/orgSetups.js";
import { responses } from "../fixtures/responses.js";
import {
	approve,
	createClaudeManagedLiveDriver,
	initEval,
	user,
} from "../harness/index.js";
import { billingAttachScores } from "../utils/scorers.js";

type EvalMetadata = {
	domain: "billing";
	flow: "attach";
};

const experimentName = "payment-failure";

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers }) => ({
		tidemark: customers.base({
			email: "ap@tidemarksystems.example",
			id: "tidemark-systems",
			name: "Tidemark Systems",
		}),
	}),
	entities: ({ customers, entities, features }) => ({
		production: entities.base({
			customer: customers.tidemark,
			feature: features.workspaces,
			id: "tidemark-production",
			name: "Production",
		}),
	}),
});

// Charge-now with no invoice: invoice_mode must be omitted entirely.
const expectedAttachRequest = {
	customer_id: setup.refs.customers.tidemark.id,
	entity_id: setup.refs.entities.production.id,
	plan_id: setup.refs.plans.scale.id,
};

initEval<EvalMetadata>({
	experimentName,
	setup,
	autumnApiOverrides: {
		attach: ({ body }) =>
			responses.attachPaymentFailure({
				reason: "The card on file was declined.",
				request: body,
			}),
	},
	driver: createClaudeManagedLiveDriver(),
	metadata: {
		domain: "billing",
		flow: "attach",
	},
	scores: billingAttachScores(),
	timeout: 300_000,
	cases: [
		{
			name: "declined charge is surfaced as a failure, not a success",
			conversation: [
				user({
					message:
						"Attach the Scale plan to Tidemark Systems' Production workspace and charge their card on file now — no invoice.",
				}),
				user({ message: "Looks good, attach it." }),
				approve(),
			],
			expect: [
				tools.called({
					toolNames: [
						"getAgentRules",
						"listPlans",
						"listCustomers",
						"listEntities",
						"previewAttach",
						"attach",
					],
				}),
				...billing.previewThenWrite({
					body: expectedAttachRequest,
					write: "attach",
				}),
				api.calledTimes({
					call: { body: expectedAttachRequest, toolName: "attach" },
					count: 1,
				}),
				// A declined card is surfaced, never retried.
				api.calledTimes({ call: { toolName: "attach" }, count: 1 }),
				api.calledTimes({
					call: { body: expectedAttachRequest, toolName: "previewAttach" },
					count: 1,
				}),
				api.calledTimes({ call: { toolName: "createEntity" }, count: 0 }),
				api.calledTimes({ call: { toolName: "createSchedule" }, count: 0 }),
				api.calledTimes({
					call: { toolName: "previewCreateSchedule" },
					count: 0,
				}),
				api.calledTimes({ call: { toolName: "updateCustomer" }, count: 0 }),
				...(["previewAttach", "attach"] as const).map((toolName) =>
					api.bodyExcludes({
						fields: [
							"invoice_mode",
							"customize",
							"starts_at",
							"ends_at",
							"feature_quantities",
							"no_billing_changes",
							"entity_data",
						],
						toolName,
					}),
				),
				response.mentions({
					notPhrases: ["now active", "all set"],
					phrases: ["Tidemark", "Scale", "card", "declined"],
				}),
			],
		},
	],
});
