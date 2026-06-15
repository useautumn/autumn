// Missing-email invoice flow: invoice_mode needs a real billing email, and this
// customer has none. The agent must ask for it and persist it via updateCustomer
// before any billing call, then run the standard preview-then-attach contract.
import { withCustomers } from "../../fixtures/createSetup.js";
import {
	api,
	billing,
	response,
	tools,
} from "../../fixtures/expectations/index.js";
import { orgSetups } from "../../fixtures/orgSetups.js";
import {
	approve,
	createClaudeManagedLiveDriver,
	initEval,
	user,
} from "../../harness/index.js";
import { billingAttachScores } from "../../utils/scorers.js";

type EvalMetadata = {
	domain: "billing";
	flow: "attach";
};

const experimentName = "missing-email";

const billingEmail = "billing@harborlight.example";

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers }) => ({
		harborlight: customers.base({
			email: null,
			id: "harborlight-journal",
			name: "Harborlight Journal",
		}),
	}),
	entities: ({ customers, entities, features }) => ({
		editorial: entities.base({
			customer: customers.harborlight,
			feature: features.workspaces,
			id: "harborlight-editorial",
			name: "Editorial",
		}),
	}),
});

const customer = setup.refs.customers.harborlight;

// No net terms were given, so net_terms_days must stay absent.
const invoiceMode = {
	enable_plan_immediately: true,
	enabled: true,
	finalize: false,
};

const expectedAttachRequest = {
	customer_id: customer.id,
	entity_id: setup.refs.entities.editorial.id,
	invoice_mode: invoiceMode,
	plan_id: setup.refs.plans.scale.id,
};

const expectedUpdateCustomerRequest = {
	customer_id: customer.id,
	email: billingEmail,
};

initEval<EvalMetadata>({
	experimentName,
	setup,
	driver: createClaudeManagedLiveDriver(),
	metadata: {
		domain: "billing",
		flow: "attach",
	},
	scores: billingAttachScores(),
	timeout: 300_000,
	cases: [
		{
			name: "invoice attach waits for the billing email before any billing call",
			conversation: [
				user({
					message:
						"Attach the Scale plan to Harborlight Journal's Editorial workspace and bill them by invoice.",
				}),
				user({ message: `Their billing email is ${billingEmail}.` }),
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
						"updateCustomer",
						"previewAttach",
						"attach",
					],
				}),
				response.askedBeforeTool({
					phrases: ["email"],
					toolName: "updateCustomer",
				}),
				// Email must be saved before billing starts, not just before attach.
				api.calledInOrder({
					calls: [
						{ body: expectedUpdateCustomerRequest, toolName: "updateCustomer" },
						{ body: expectedAttachRequest, toolName: "previewAttach" },
						{ body: expectedAttachRequest, toolName: "attach" },
					],
				}),
				...billing.previewThenWrite({
					body: expectedAttachRequest,
					write: "attach",
				}),
				api.calledTimes({
					call: {
						body: expectedUpdateCustomerRequest,
						toolName: "updateCustomer",
					},
					count: 1,
				}),
				api.calledTimes({ call: { toolName: "updateCustomer" }, count: 1 }),
				api.calledTimes({
					call: { body: expectedAttachRequest, toolName: "attach" },
					count: 1,
				}),
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
				...(["previewAttach", "attach"] as const).map((toolName) =>
					api.bodyExcludes({
						fields: [
							"invoice_mode.net_terms_days",
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
					phrases: ["Harborlight", "Scale", "invoice"],
				}),
			],
		},
	],
});
