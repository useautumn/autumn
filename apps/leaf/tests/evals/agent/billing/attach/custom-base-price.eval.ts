import { withCustomers } from "../../../fixtures/createSetup.js";
import {
	api,
	billing,
	response,
	tools,
} from "../../../fixtures/expectations/index.js";
import { orgSetups } from "../../../fixtures/orgSetups.js";
import { approve, initEval, user } from "../../../harness/index.js";
import { billingAttachScores } from "../../../utils/scorers.js";

type EvalMetadata = {
	domain: "billing";
	flow: "attach";
};

const experimentName = "attach-custom-price";
const customPrice = 49;

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers }) => ({
		account: customers.base({
			email: "billing@northstar.example",
			id: "cus_attach_custom_price",
			name: "Northstar Labs",
		}),
	}),
	entities: ({ customers, entities, features }) => ({
		workspace: entities.base({
			customer: customers.account,
			feature: features.workspaces,
			id: "workspace_northstar",
			name: "Northstar Workspace",
		}),
	}),
});
const customer = setup.refs.customers.account;
const enterprisePlan = setup.refs.plans.enterprise;
const workspace = setup.refs.entities.workspace;

const expectedAttachRequest = {
	customer_id: customer.id,
	customize: {
		price: {
			amount: customPrice,
			interval: "month",
		},
	},
	enable_plan_immediately: true,
	entity_id: workspace.id,
	invoice_mode: {
		enable_plan_immediately: true,
		enabled: true,
		finalize: false,
	},
	plan_id: enterprisePlan.id,
};

initEval<EvalMetadata>({
	experimentName,
	setup,
	metadata: {
		domain: "billing",
		flow: "attach",
	},
	scores: billingAttachScores(),
	cases: [
		{
			name: "custom monthly price with draft invoice",
			conversation: [
				user({
					message:
						"Please attach the Enterprise plan to Northstar Labs for Northstar Workspace with a custom base price of $49/month.",
				}),
				user({ message: "Looks good, attach it." }),
				approve(),
			],
			expect: [
				tools.called({
					toolNames: ["listCustomers", "listPlans", "listEntities"],
				}),
				api.calledInOrder({
					calls: [
						{
							body: { customer_id: customer.id },
							toolName: "listEntities",
						},
						{
							body: expectedAttachRequest,
							toolName: "previewAttach",
						},
					],
				}),
				billing.previewBeforeWrite({
					preview: {
						body: expectedAttachRequest,
						toolName: "previewAttach",
					},
					write: {
						body: expectedAttachRequest,
						toolName: "attach",
					},
				}),
				api.calledAfterApproval({
					call: {
						body: expectedAttachRequest,
						toolName: "attach",
					},
				}),
				response.mentions({
					phrases: [
						"Northstar Labs",
						"Northstar Workspace",
						"Enterprise",
						"$49",
						"invoice",
						"immediately",
					],
				}),
			],
		},
	],
});
